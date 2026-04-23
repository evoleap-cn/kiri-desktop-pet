/**
 * WhisperX API 客户端
 * 
 * 封装 WhisperX API 调用，支持模型加载、说话人分离、流式转录。
 * 服务地址: http://192.168.1.66:9000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_URL = 'http://192.168.1.66:9000';

class WhisperXClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.transcriptionModel = options.transcriptionModel || 'large-v3';
    this.diarizationModel = options.diarizationModel || 'pyannote/speaker-diarization-3.1';
    this.computeType = options.computeType || 'float16';
    this.language = options.language || 'zh';
    this._transcriptionModelLoaded = false;
    this._diarizationModelLoaded = false;
  }

  /**
   * 加载转录模型
   * @returns {Promise<{status: string, model: string}>}
   */
  async loadTranscriptionModel() {
    if (this._transcriptionModelLoaded) {
      return { status: 'success', model: this.transcriptionModel, cached: true };
    }

    const url = `${this.baseUrl}/models/load`;
    const body = `model=${encodeURIComponent(this.transcriptionModel)}&compute_type=${this.computeType}`;

    try {
      const result = await this._postForm(url, body);
      if (result.status === 'success') {
        this._transcriptionModelLoaded = true;
      }
      return result;
    } catch (err) {
      throw new Error(`加载转录模型失败: ${err.message}`);
    }
  }

  /**
   * 加载说话人分离模型
   * @returns {Promise<{status: string, model: string}>}
   */
  async loadDiarizationModel() {
    if (this._diarizationModelLoaded) {
      return { status: 'success', model: this.diarizationModel, cached: true };
    }

    const url = `${this.baseUrl}/diarize_models/load`;
    const body = `model=${encodeURIComponent(this.diarizationModel)}`;

    try {
      const result = await this._postForm(url, body);
      if (result.status === 'success') {
        this._diarizationModelLoaded = true;
      }
      return result;
    } catch (err) {
      throw new Error(`加载说话人分离模型失败: ${err.message}`);
    }
  }

  /**
   * 检查模型加载状态
   * @returns {Promise<{transcription: boolean, diarization: boolean}>}
   */
  async checkModelStatus() {
    try {
      const [transList, diarizeList] = await Promise.all([
        this._get(`${this.baseUrl}/models/list`),
        this._get(`${this.baseUrl}/diarize_models/list`),
      ]);
      return {
        transcription: this._transcriptionModelLoaded,
        diarization: this._diarizationModelLoaded,
      };
    } catch {
      return { transcription: false, diarization: false };
    }
  }

  /**
   * 转录音频文件（非流式，等待完整结果）
   * @param {string} audioPath - 音频文件路径
   * @param {object} options - 可选参数
   * @returns {Promise<object>} 转录结果
   */
  async transcribe(audioPath, options = {}) {
    const {
      diarize = true,
      language = this.language,
      responseFormat = 'verbose_json',
    } = options;

    const url = `${this.baseUrl}/v1/audio/transcriptions`;

    try {
      return await this._uploadFile(url, audioPath, {
        model: this.transcriptionModel,
        language,
        diarize: String(diarize),
        response_format: responseFormat,
      });
    } catch (err) {
      throw new Error(`转录失败: ${err.message}`);
    }
  }

  /**
   * 流式转录音频文件（SSE）
   * @param {string} audioPath - 音频文件路径
   * @param {object} options - 可选参数
   * @param {function} onSegment - 每个片段的回调 (segment) => void
   * @param {function} onProgress - 进度回调 (progress: 0-100) => void
   * @returns {Promise<object>} 完整结果
   */
  async transcribeStream(audioPath, { onSegment, onProgress } = {}) {
    const {
      diarize = true,
      language = this.language,
      responseFormat = 'verbose_json',
    } = {};

    const url = `${this.baseUrl}/v1/audio/transcriptions`;

    return new Promise((resolve, reject) => {
      const audioBuffer = fs.readFileSync(audioPath);
      const boundary = `----FormBoundary${Date.now()}`;

      // 构建 multipart/form-data body
      let body = '';
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="model"\r\n\r\n`;
      body += `${this.transcriptionModel}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="language"\r\n\r\n`;
      body += `${language}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="diarize"\r\n\r\n`;
      body += `${diarize}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="stream"\r\n\r\n`;
      body += `true\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="response_format"\r\n\r\n`;
      body += `${responseFormat}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="file"; filename="${path.basename(audioPath)}"\r\n`;
      body += `Content-Type: audio/wav\r\n\r\n`;

      const bodyPrefix = Buffer.from(body, 'utf-8');
      const bodySuffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
      const contentLength = bodyPrefix.length + audioBuffer.length + bodySuffix.length;

      const urlObj = new URL(url);
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': contentLength,
        },
        timeout: 0, // 流式请求不设置超时
      };

      const req = http.request(reqOptions, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', chunk => { errorData += chunk; });
          res.on('end', () => {
            reject(new Error(`HTTP ${res.statusCode}: ${errorData}`));
          });
          return;
        }

        let buffer = '';
        const segments = [];

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一个不完整的行

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              // 流式完成
              resolve({ segments, text: segments.map(s => s.text).join('') });
              return;
            }

            try {
              const segment = JSON.parse(payload);
              segments.push(segment);
              if (onSegment) onSegment(segment);
              // 估算进度（基于已识别片段数，这只是粗略估计）
              if (onProgress) {
                // 我们无法准确知道总片段数，所以用一个递增的估计
                const estimatedProgress = Math.min(95, segments.length * 5);
                onProgress(estimatedProgress);
              }
            } catch (parseErr) {
              console.warn('[WhisperX] Failed to parse SSE segment:', parseErr);
            }
          }
        });

        res.on('end', () => {
          // 如果还有剩余数据
          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data:')) {
              const payload = trimmed.slice(5).trim();
              if (payload !== '[DONE]') {
                try {
                  const segment = JSON.parse(payload);
                  segments.push(segment);
                  if (onSegment) onSegment(segment);
                } catch {}
              }
            }
          }
          if (onProgress) onProgress(100);
          resolve({ segments, text: segments.map(s => s.text).join('') });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      // 发送请求体
      req.write(bodyPrefix);
      req.write(audioBuffer);
      req.write(bodySuffix);
      req.end();
    });
  }

  // ─── Private Helper Methods ────────────────────────────────────────────

  _postForm(url, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  _get(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  _uploadFile(url, filePath, fields) {
    return new Promise((resolve, reject) => {
      const fileBuffer = fs.readFileSync(filePath);
      const boundary = `----FormBoundary${Date.now()}`;

      let body = '';
      for (const [key, value] of Object.entries(fields)) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
        body += `${value}\r\n`;
      }
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\n`;
      body += `Content-Type: audio/wav\r\n\r\n`;

      const bodyPrefix = Buffer.from(body, 'utf-8');
      const bodySuffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
      const contentLength = bodyPrefix.length + fileBuffer.length + bodySuffix.length;

      const urlObj = new URL(url);
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': contentLength,
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
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
}

module.exports = { WhisperXClient };
