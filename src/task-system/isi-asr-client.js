/**
 * ISI ASR WebSocket 客户端
 *
 * 封装阿里云 ISI WebSocket 协议，支持流式语音识别和说话人分离。
 * 端点：ws://<host>:8500/api/v1/ws/transcribe
 * 兼容阿里云 ISI WebSocket 协议，扩展了说话人识别（SpeakerDiarization 事件）。
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_WS_URL = 'ws://192.168.1.66:8500';

class ISIAsrClient {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || DEFAULT_WS_URL;
    this.sampleRate = options.sampleRate || 16000;
    this.maxSentenceSilence = options.maxSentenceSilence || 800;
    this.enableIntermediateResult = options.enableIntermediateResult !== false;
    this.chunkSamples = options.chunkSamples || 3200; // 200ms @ 16kHz
  }

  /**
   * 转录音频文件（WebSocket 流式）
   * @param {string} audioPath - 音频文件路径（WAV 或 PCM）
   * @param {object} options - 可选参数
   * @param {function} onSegment - 每个句子的回调 (segment) => void
   * @param {function} onProgress - 进度回调 (progress: 0-100) => void
   * @returns {Promise<{segments: Array, diarizationSegments: Array, text: string}>}
   */
  async transcribe(audioPath, { onSegment, onProgress } = {}) {
    const taskId = crypto.randomBytes(16).toString('hex');
    const wsUrl = `${this.wsUrl}/api/v1/ws/transcribe`;

    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        return reject(new Error(`WebSocket 连接失败: ${err.message}`));
      }

      const segments = [];
      let diarizationSegments = [];
      let isStopped = false;
      let audioBuffer = null;
      let sessionId = null;
      let hasResolved = false;

      ws.on('open', () => {
        // 发送 StartTranscription
        const startMsg = {
          header: {
            message_id: crypto.randomBytes(16).toString('hex'),
            task_id: taskId,
            namespace: 'SpeechTranscriber',
            name: 'StartTranscription',
          },
          payload: {
            format: 'pcm',
            sample_rate: this.sampleRate,
            enable_intermediate_result: this.enableIntermediateResult,
            max_sentence_silence: this.maxSentenceSilence,
          },
        };
        ws.send(JSON.stringify(startMsg));
      });

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          console.warn('[ISIAsr] Failed to parse message:', raw.toString().slice(0, 100));
          return;
        }

        const header = msg.header || {};
        const name = header.name;
        const status = header.status;

        // 检查错误
        if (status && status !== 20000000) {
          const errMsg = `ASR 错误: ${header.status_message || '未知错误'} (${status})`;
          if (!hasResolved) {
            hasResolved = true;
            reject(new Error(errMsg));
            try { ws.close(); } catch {}
          }
          return;
        }

        switch (name) {
          case 'TranscriptionStarted': {
            sessionId = msg.payload?.session_id;
            // 开始发送音频
            this._sendAudio(ws, audioPath, taskId, (progress) => {
              if (onProgress) onProgress(progress * 0.8); // 发送占 80%
            })
              .then(() => {
                isStopped = true;
                // 发送 StopTranscription
                const stopMsg = {
                  header: {
                    message_id: crypto.randomBytes(16).toString('hex'),
                    task_id: taskId,
                    namespace: 'SpeechTranscriber',
                    name: 'StopTranscription',
                  },
                };
                ws.send(JSON.stringify(stopMsg));
              })
              .catch((err) => {
                if (!hasResolved) {
                  hasResolved = true;
                  reject(new Error(`发送音频失败: ${err.message}`));
                  try { ws.close(); } catch {}
                }
              });
            break;
          }

          case 'SentenceBegin': {
            // 句子开始，记录时间戳
            break;
          }

          case 'TranscriptionResultChanged': {
            // 中间结果，可选（这里不处理，只关心最终句子）
            break;
          }

          case 'SentenceEnd': {
            const p = msg.payload;
            const segment = {
              speaker: null, // 说话人信息在 SpeakerDiarization 中
              text: p.result || '',
              start: (p.begin_time || 0) / 1000, // ms → s
              end: (p.time || 0) / 1000,
              index: p.index,
            };
            segments.push(segment);
            if (onSegment) onSegment(segment);
            if (onProgress) {
              // 句子结束时更新进度
              const progress = 0.8 + (segments.length * 0.05);
              onProgress(Math.min(95, progress));
            }
            break;
          }

          case 'SpeakerDiarization': {
            // 离线说话人标注，覆盖 segments 的 speaker 信息
            diarizationSegments = (msg.payload?.segments || []).map((seg) => ({
              speaker: seg.speaker || 'spk_unknown',
              text: seg.result || '',
              start: (seg.begin_time || 0) / 1000,
              end: (seg.time || 0) / 1000,
              index: seg.index,
            }));
            // 用说话人标注替换简单句子
            if (diarizationSegments.length > 0) {
              segments.length = 0;
              segments.push(...diarizationSegments);
              if (onProgress) onProgress(98);
            }
            break;
          }

          case 'TranscriptionCompleted': {
            if (!hasResolved) {
              hasResolved = true;
              if (onProgress) onProgress(100);
              resolve({
                segments,
                diarizationSegments,
                text: segments.map((s) => s.text).join(''),
              });
            }
            try { ws.close(); } catch {}
            break;
          }

          case 'TaskFailed': {
            if (!hasResolved) {
              hasResolved = true;
              reject(new Error(`任务失败: ${header.status_message || '未知'}`));
            }
            try { ws.close(); } catch {}
            break;
          }

          default:
            console.warn('[ISIAsr] Unknown event:', name);
        }
      });

      ws.on('error', (err) => {
        if (!hasResolved) {
          hasResolved = true;
          reject(new Error(`WebSocket 错误: ${err.message}`));
        }
      });

      ws.on('close', () => {
        // 如果还未 resolve，说明异常断开
        if (!hasResolved) {
          hasResolved = true;
          reject(new Error('WebSocket 连接意外关闭'));
        }
      });
    });
  }

  /**
   * 读取音频文件并通过 WebSocket 发送 PCM 帧
   * @param {WebSocket} ws - WebSocket 实例
   * @param {string} audioPath - 音频文件路径
   * @param {string} taskId - 任务 ID
   * @param {function} onProgress - 发送进度回调
   * @returns {Promise<void>}
   */
  _sendAudio(ws, audioPath, taskId, onProgress) {
    return new Promise((resolve, reject) => {
      try {
        const audioBuffer = fs.readFileSync(audioPath);

        // 如果是 WAV 文件，需要跳过 44 字节头部
        let pcmData = audioBuffer;
        if (audioPath.toLowerCase().endsWith('.wav')) {
          // 简单处理：跳过 WAV 头部（假设标准 44 字节）
          // 更严谨的做法是解析 WAV header 获取 data chunk 偏移
          const isWav = audioBuffer.slice(0, 4).toString() === 'RIFF';
          if (isWav) {
            // 查找 'data' chunk
            let offset = 12;
            while (offset < audioBuffer.length - 8) {
              const chunkType = audioBuffer.slice(offset, offset + 4).toString();
              const chunkSize = audioBuffer.readUInt32LE(offset + 4);
              if (chunkType === 'data') {
                pcmData = audioBuffer.slice(offset + 8);
                break;
              }
              offset += 8 + chunkSize;
            }
          }
        }

        // 分帧发送
        const totalBytes = pcmData.length;
        let sentBytes = 0;

        const sendFrame = () => {
          if (sentBytes >= totalBytes) {
            onProgress(1);
            resolve();
            return;
          }

          const end = Math.min(sentBytes + this.chunkSamples * 2, totalBytes); // 2 bytes per sample
          const chunk = pcmData.slice(sentBytes, end);

          // 以 Binary Frame 发送
          ws.send(chunk, { binary: true });

          sentBytes += chunk.length;
          onProgress(sentBytes / totalBytes);

          // 模拟实时发送间隔（100ms）
          setTimeout(sendFrame, 100);
        };

        sendFrame();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = { ISIAsrClient };
