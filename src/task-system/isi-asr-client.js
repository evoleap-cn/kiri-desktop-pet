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
    // 确保 wsUrl 不包含末尾斜杠
    const baseUrl = this.wsUrl.replace(/\/+$/, '');
    const fullWsUrl = `${baseUrl}/api/v1/ws/transcribe`;

    console.log('[ISIAsr] Connecting to:', fullWsUrl);
    console.log('[ISIAsr] Audio file:', audioPath);

    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(fullWsUrl);
      } catch (err) {
        console.error('[ISIAsr] WebSocket creation failed:', err);
        return reject(new Error(`WebSocket 连接失败: ${err.message}`));
      }

      const segments = [];
      let diarizationSegments = [];
      let sessionId = null;
      let hasResolved = false;
      let audioSent = false;

      const safeReject = (err) => {
        if (!hasResolved) {
          hasResolved = true;
          console.error('[ISIAsr] Rejecting:', err.message);
          reject(err);
          try { ws.close(); } catch {}
        }
      };

      ws.on('open', () => {
        console.log('[ISIAsr] WebSocket connected');
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
        console.log('[ISIAsr] Sending StartTranscription:', JSON.stringify(startMsg, null, 2));
        ws.send(JSON.stringify(startMsg));
      });

      ws.on('message', (raw) => {
        // 检查是否是二进制消息（不应该，但记录一下）
        if (!Buffer.isBuffer(raw) && typeof raw !== 'string') {
          console.warn('[ISIAsr] Unexpected message type:', typeof raw);
          return;
        }

        let msg;
        try {
          const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
          msg = JSON.parse(text);
        } catch (e) {
          console.warn('[ISIAsr] Failed to parse message:', raw.toString().slice(0, 200));
          return;
        }

        const header = msg.header || {};
        const name = header.name;
        const status = header.status;

        console.log('[ISIAsr] Received event:', name, 'status:', status);

        // 检查错误
        if (status && status !== 20000000) {
          const errMsg = `ASR 错误: ${header.status_message || '未知错误'} (${status})`;
          safeReject(new Error(errMsg));
          return;
        }

        switch (name) {
          case 'TranscriptionStarted': {
            sessionId = msg.payload?.session_id;
            console.log('[ISIAsr] Transcription started, session:', sessionId);
            // 开始发送音频
            this._sendAudio(ws, audioPath, (progress) => {
              if (onProgress) onProgress(progress * 0.8); // 发送占 80%
            })
              .then(() => {
                console.log('[ISIAsr] Audio sending complete, sending StopTranscription');
                audioSent = true;
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
                safeReject(new Error(`发送音频失败: ${err.message}`));
              });
            break;
          }

          case 'SentenceBegin': {
            console.log('[ISIAsr] SentenceBegin:', msg.payload);
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
            console.log(`[ISIAsr] SentenceEnd [${segment.start.toFixed(1)}s-${segment.end.toFixed(1)}s]: "${segment.text}"`);
            if (onSegment) onSegment(segment);
            if (onProgress) {
              // 句子结束时更新进度
              const progress = 0.8 + (segments.length * 0.05);
              onProgress(Math.min(95, progress));
            }
            break;
          }

          case 'SpeakerDiarization': {
            console.log('[ISIAsr] SpeakerDiarization received, segments:', msg.payload?.segments?.length || 0);
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
              console.log('[ISIAsr] Replaced segments with diarization segments');
              if (onProgress) onProgress(98);
            }
            break;
          }

          case 'TranscriptionCompleted': {
            console.log('[ISIAsr] TranscriptionCompleted, total segments:', segments.length);
            hasResolved = true;
            if (onProgress) onProgress(100);
            resolve({
              segments,
              diarizationSegments,
              text: segments.map((s) => s.text).join(''),
            });
            try { ws.close(); } catch {}
            break;
          }

          case 'TaskFailed': {
            safeReject(new Error(`任务失败: ${header.status_message || '未知'}`));
            break;
          }

          default:
            console.warn('[ISIAsr] Unknown event:', name, JSON.stringify(msg).slice(0, 200));
        }
      });

      ws.on('error', (err) => {
        console.error('[ISIAsr] WebSocket error:', err.message);
        safeReject(new Error(`WebSocket 错误: ${err.message}`));
      });

      ws.on('close', (code, reason) => {
        console.log('[ISIAsr] WebSocket closed, code:', code, 'reason:', reason.toString());
        // 如果还未 resolve，说明异常断开
        if (!hasResolved) {
          safeReject(new Error(`WebSocket 连接意外关闭 (code: ${code})`));
        }
      });
    });
  }

  /**
   * 读取音频文件并通过 WebSocket 发送 PCM 帧
   * @param {WebSocket} ws - WebSocket 实例
   * @param {string} audioPath - 音频文件路径
   * @param {function} onProgress - 发送进度回调
   * @returns {Promise<void>}
   */
  _sendAudio(ws, audioPath, onProgress) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ISIAsr] Reading audio file:', audioPath);
        const audioBuffer = fs.readFileSync(audioPath);
        console.log('[ISIAsr] Audio file size:', audioBuffer.length, 'bytes');

        // 如果是 WAV 文件，需要跳过头部
        let pcmData = audioBuffer;
        const ext = path.extname(audioPath).toLowerCase();

        if (ext === '.wav') {
          console.log('[ISIAsr] Parsing WAV file...');
          // 检查 RIFF header
          const riffHeader = audioBuffer.slice(0, 4).toString('ascii');
          console.log('[ISIAsr] RIFF header:', riffHeader);

          if (riffHeader === 'RIFF') {
            // 查找 'data' chunk
            let offset = 12;
            let found = false;
            while (offset < audioBuffer.length - 8) {
              const chunkType = audioBuffer.slice(offset, offset + 4).toString('ascii');
              const chunkSize = audioBuffer.readUInt32LE(offset + 4);
              console.log(`[ISIAsr] Chunk: ${chunkType}, size: ${chunkSize}`);
              if (chunkType === 'data') {
                pcmData = audioBuffer.slice(offset + 8, offset + 8 + chunkSize);
                console.log('[ISIAsr] Found data chunk, PCM size:', pcmData.length, 'bytes');
                found = true;
                break;
              }
              offset += 8 + chunkSize;
              // 防止无限循环（坏文件）
              if (offset > audioBuffer.length) {
                console.error('[ISIAsr] Invalid WAV file structure');
                break;
              }
            }
            if (!found) {
              reject(new Error('WAV 文件中未找到 data chunk'));
              return;
            }
          } else {
            console.warn('[ISIAsr] Not a valid RIFF WAV file, treating as raw PCM');
          }
        }

        // 分帧发送
        const totalBytes = pcmData.length;
        let sentBytes = 0;
        const chunkSize = this.chunkSamples * 2; // 2 bytes per sample (int16)

        console.log(`[ISIAsr] Sending audio: ${totalBytes} bytes, chunk size: ${chunkSize} bytes`);

        const sendFrame = () => {
          if (sentBytes >= totalBytes) {
            console.log('[ISIAsr] All audio sent');
            onProgress(1);
            resolve();
            return;
          }

          const end = Math.min(sentBytes + chunkSize, totalBytes);
          const chunk = pcmData.slice(sentBytes, end);

          // 以 Binary Frame 发送
          ws.send(chunk, { binary: true });

          sentBytes += chunk.length;
          onProgress(sentBytes / totalBytes);

          // 每 100ms 发送一帧，模拟实时流
          setTimeout(sendFrame, 100);
        };

        sendFrame();
      } catch (err) {
        console.error('[ISIAsr] _sendAudio error:', err);
        reject(err);
      }
    });
  }
}

module.exports = { ISIAsrClient };
