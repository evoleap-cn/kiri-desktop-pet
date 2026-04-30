/**
 * ISI ASR 客户端
 *
 * 封装阿里云 ISI ASR 服务，支持两种模式：
 * 1. REST API 异步任务队列（推荐，用于已完成的录音文件）
 *    - POST /api/v1/transcribe 提交文件
 *    - GET /api/v1/jobs/{job_id} 轮询进度
 *    - GET /api/v1/jobs/{job_id}/result 获取带说话人标注的结果
 * 2. WebSocket 流式转录（已弃用，保留用于未来实时录音场景）
 *
 * 端点：http://<host>:8500
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_BASE_URL = 'http://192.168.1.66:8500';

class ISIAsrClient {
  constructor(options = {}) {
    // wsUrl 兼容旧配置格式（如 ws://192.168.1.66:8500），提取 host:port
    const rawUrl = options.wsUrl || options.baseUrl || DEFAULT_BASE_URL;
    // 将 ws:// 或 http:// 统一解析为 baseUrl
    this.baseUrl = rawUrl.replace(/^ws:\/\//, 'http://').replace(/\/+$/, '');
    this.pollInterval = options.pollInterval || 200; // 轮询间隔（毫秒）
  }

  // ─── REST API 异步任务队列 ────────────────────────────────────────

  /**
   * 转录音频文件（REST API 异步任务）
   * @param {string} audioPath - 音频文件路径
   * @param {object} options - 可选参数
   * @param {function} onSegment - 每个句子的回调 (segment) => void
   * @param {function} onProgress - 进度回调 (progress: 0-100) => void
   * @returns {Promise<{segments: Array, text: string, duration: number}>}
   */
  async transcribe(audioPath, { onSegment, onProgress } = {}) {
    console.log('[ISIAsr] Submitting transcription job for:', audioPath);

    // 第一步：提交任务
    const job = await this.submitJob(audioPath);
    const jobId = job.job_id;
    console.log('[ISIAsr] Job submitted, job_id:', jobId, 'status:', job.status);

    // 第二步：轮询进度
    let jobStatus = job;
    while (jobStatus.status !== 'done' && jobStatus.status !== 'failed') {
      await this._delay(this.pollInterval);
      jobStatus = await this.pollJobStatus(jobId);

      if (onProgress && jobStatus.status === 'processing') {
        // 报告阶段内部进度（0-100）
        onProgress(jobStatus.progress || 0);
      }

      if (jobStatus.status === 'failed') {
        throw new Error(`ASR 任务失败: ${jobStatus.error || '未知错误'}`);
      }
    }

    console.log('[ISIAsr] Job completed, status:', jobStatus.status);

    // 第三步：获取结果
    const result = await this.getJobResult(jobId);

    // 格式化 segments
    const segments = (result.segments || []).map((seg) => ({
      speaker: seg.speaker || 'spk_unknown',
      text: seg.text || '',
      start: (seg.start_ms || 0) / 1000,
      end: (seg.end_ms || 0) / 1000,
    }));

    // 调用 onSegment 回调
    if (onSegment) {
      for (const seg of segments) {
        onSegment(seg);
      }
    }

    if (onProgress) onProgress(100);

    return {
      segments,
      text: result.full_text || segments.map((s) => s.text).join(''),
      duration: result.duration_seconds || 0,
    };
  }

  /**
   * 第一步：提交转录任务
   * POST /api/v1/transcribe
   * @param {string} audioPath - 音频文件路径
   * @returns {Promise<{job_id: string, status: string, created_at: string}>}
   */
  async submitJob(audioPath) {
    const endpoint = '/api/v1/transcribe';
    return this._uploadFile(endpoint, audioPath);
  }

  /**
   * 第二步：轮询任务状态（带自动重试）
   * GET /api/v1/jobs/{job_id}
   * @param {string} jobId - 任务 ID
   * @returns {Promise<{job_id: string, status: string, progress: number}>}
   */
  async pollJobStatus(jobId, retries = 3) {
    const endpoint = `/api/v1/jobs/${jobId}`;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this._request('GET', endpoint);
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          // 递增延迟重试：200ms, 500ms, 1000ms
          const delay = 200 + attempt * 300;
          console.log(`[ISIAsr] pollJobStatus 失败，${delay}ms 后重试 (${attempt + 1}/${retries}): ${err.message}`);
          await this._delay(delay);
        }
      }
    }

    throw new Error(`轮询任务状态失败: ${lastError.message}`);
  }

  /**
   * 第三步：获取任务结果
   * GET /api/v1/jobs/{job_id}/result
   * @param {string} jobId - 任务 ID
   * @returns {Promise<{job_id: string, status: string, full_text: string, segments: Array, duration_seconds: number}>}
   */
  async getJobResult(jobId) {
    const endpoint = `/api/v1/jobs/${jobId}/result`;
    return this._request('GET', endpoint);
  }

  /**
   * 删除任务记录
   * DELETE /api/v1/jobs/{job_id}
   * @param {string} jobId - 任务 ID
   */
  async deleteJob(jobId) {
    const endpoint = `/api/v1/jobs/${jobId}`;
    return this._request('DELETE', endpoint);
  }

  /**
   * 健康检查
   * GET /api/v1/health
   * @returns {Promise<{status: string, model_loaded: boolean}>}
   */
  async healthCheck() {
    const endpoint = '/api/v1/health';
    return this._request('GET', endpoint);
  }

  // ─── 私有方法 ────────────────────────────────────────────────────────

  /**
   * 上传文件（multipart/form-data）
   * @param {string} endpoint - API 端点
   * @param {string} filePath - 文件路径
   * @returns {Promise<object>}
   */
  _uploadFile(endpoint, filePath) {
    return new Promise((resolve, reject) => {
      const fileBuffer = fs.readFileSync(filePath);
      const boundary = `----FormBoundary${Date.now()}`;

      let body = '';
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\n`;
      body += `Content-Type: audio/wav\r\n\r\n`;

      const bodyPrefix = Buffer.from(body, 'utf-8');
      const bodySuffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
      const contentLength = bodyPrefix.length + fileBuffer.length + bodySuffix.length;

      const parsedUrl = url.parse(this.baseUrl + endpoint);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': contentLength,
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 202) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`Invalid JSON response: ${data}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(bodyPrefix);
      req.write(fileBuffer);
      req.write(bodySuffix);
      req.end();
    });
  }

  /**
   * 发送 HTTP 请求
   * @param {string} method - HTTP 方法
   * @param {string} endpoint - API 端点
   * @param {object} [body] - 请求体（可选）
   * @returns {Promise<object>}
   */
  _request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const parsedUrl = url.parse(this.baseUrl + endpoint);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method,
        headers: {},
      };

      let bodyData = null;
      if (body) {
        bodyData = JSON.stringify(body);
        reqOptions.headers['Content-Type'] = 'application/json';
        reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 204) {
            // DELETE 成功，无内容
            resolve({ status: 'deleted' });
          } else if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`Invalid JSON response: ${data}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      if (bodyData) req.write(bodyData);
      req.end();
    });
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── WebSocket 流式转录（已弃用）──────────────────────────────────────
  // @deprecated 保留用于未来实时录音场景
  // 参考：d:\Steve\Download\funasr-portable-package-20260423\docs\websocket-api.md
  //
  // 使用方式：
  //   const ws = new WebSocket(`${this.baseUrl}/api/v1/ws/transcribe`);
  //   ws.send(JSON.stringify({ header: { name: 'StartTranscription', ... }, payload: { ... } }));
  //   // 发送 PCM 音频帧（Binary Frame）
  //   ws.send(pcmChunk, { binary: true });
  //   ws.send(JSON.stringify({ header: { name: 'StopTranscription', ... } }));
  //   // 接收事件：TranscriptionStarted, SentenceBegin, SentenceEnd,
  //   //           SpeakerDiarization, TranscriptionCompleted
}

module.exports = { ISIAsrClient };
