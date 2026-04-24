const fs = require('fs');
const path = require('path');

function createRecordingSummaryManager({ getWin, windowManager, stateManager, taskManager }) {
  let isRecording = false;
  let audioChunks = [];

  // 音频参数
  const SAMPLE_RATE = 16000;
  const BITS_PER_SAMPLE = 16;
  const NUM_CHANNELS = 1; // 单声道

  function notifyRenderer(channel, ...args) {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
    try {
      const popupWin = windowManager.getPopup();
      if (popupWin && !popupWin.isDestroyed()) {
        popupWin.webContents.send(channel, ...args);
      }
    } catch {}
    try {
      const recordingWin = windowManager.getRecordingWin();
      if (recordingWin && !recordingWin.isDestroyed()) {
        recordingWin.webContents.send(channel, ...args);
      }
    } catch {}
  }

  function getPrefs() {
    const PREFS_PATH = path.join(require('electron').app.getPath('userData'), 'evoleap-pet-prefs.json');
    try {
      return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
    } catch {
      return {};
    }
  }

  function getSavePath() {
    const prefs = getPrefs();
    return prefs.recordingSavePath || require('electron').app.getPath('documents');
  }

  function getOutputPaths() {
    const prefs = getPrefs();
    const defaultDocs = require('electron').app.getPath('documents');
    return {
      isi: prefs.isiWsUrl || "ws://192.168.1.66:8500",
      recording: prefs.recordingSavePath || defaultDocs,
      json: prefs.jsonOutputPath || defaultDocs,
      markdown: prefs.markdownOutputPath || defaultDocs,
    };
  }

  function generateFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `recording_${year}${month}${day}_${hours}${minutes}${seconds}.wav`;
  }

  function createWavBuffer(pcmChunks) {
    // 合并所有 PCM 数据
    const totalLength = pcmChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const pcmData = new Int16Array(totalLength / 2);
    let offset = 0;
    for (const chunk of pcmChunks) {
      const arr = new Int16Array(chunk);
      pcmData.set(arr, offset);
      offset += arr.length;
    }

    // 创建 WAV 文件头
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);

    // WAV 文件头
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');

    // fmt 子块
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // 子块大小
    view.setUint16(20, 1, true); // 音频格式 (PCM)
    view.setUint16(22, NUM_CHANNELS, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE / 8, true); // 字节率
    view.setUint16(32, NUM_CHANNELS * BITS_PER_SAMPLE / 8, true); // 块对齐
    view.setUint16(34, BITS_PER_SAMPLE, true);

    // data 子块
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);

    // 写入 PCM 数据
    const pcmBytes = new Uint8Array(buffer, 44);
    pcmBytes.set(new Uint8Array(pcmData.buffer));

    return Buffer.from(buffer);
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function saveWavFile(pcmChunks) {
    try {
      const savePath = getSavePath();

      // 确保目录存在
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }

      const fileName = generateFileName();
      const filePath = path.join(savePath, fileName);

      const wavBuffer = createWavBuffer(pcmChunks);
      fs.writeFileSync(filePath, wavBuffer);

      const duration = (pcmChunks.length * 1600 / SAMPLE_RATE).toFixed(1);
      console.log(`[RecordingSummary] Saved recording to: ${filePath} (${wavBuffer.length} bytes, ~${duration}s)`);
      
      return filePath;
    } catch (err) {
      console.error('[RecordingSummary] Failed to save WAV file:', err.message);
      return null;
    }
  }

  function startRecording() {
    if (isRecording) {
      console.log('[RecordingSummary] Already recording, ignoring start request');
      return false;
    }

    const success = stateManager.transition('recording_summary');
    if (!success) {
      console.warn('[RecordingSummary] State transition failed');
      return false;
    }

    isRecording = true;
    audioChunks = [];

    const win = getWin();
    const petBounds = win && !win.isDestroyed() ? win.getBounds() : { x: 0, y: 0 };
    windowManager.showRecordingWindow(petBounds.x, petBounds.y);

    console.log('[RecordingSummary] Recording started');
    notifyRenderer('summary:recording-started');
    return true;
  }

  function stopRecording() {
    if (!isRecording) {
      console.log('[RecordingSummary] Not recording, ignoring stop request');
      return;
    }

    try {
      isRecording = false;
      console.log(`[RecordingSummary] Recording stopped, collected ${audioChunks.length} chunks`);

      // 保存 WAV 文件
      let savedFilePath = null;
      if (audioChunks.length > 0) {
        savedFilePath = saveWavFile(audioChunks);
      } else {
        console.warn('[RecordingSummary] No audio data to save');
      }

      windowManager.hideRecordingWindow();

      stateManager.transition('idle');
      notifyRenderer('summary:recording-stopped');

      // 如果保存了文件，创建录音纪要任务
      if (savedFilePath && taskManager) {
        const outputPaths = getOutputPaths();
        console.log(`[RecordingSummary] Creating task for: ${savedFilePath}`);
        taskManager.createRecordingSummaryTask(savedFilePath, {
          outputPaths,
          isi: { wsUrl: outputPaths.isi },
        });
        // 自动开始处理队列
        taskManager.processNext();
        // 自动打开任务窗口
        if (windowManager && typeof windowManager.showTaskWindow === 'function') {
          windowManager.showTaskWindow();
        }
      }

      audioChunks = [];

    } catch (err) {
      console.error('[RecordingSummary] Error stopping recording:', err.message);
      isRecording = false;
      windowManager.hideRecordingWindow();
      stateManager.transition('idle');
      notifyRenderer('summary:error', err.message);
    }
  }

  function collectAudioChunk(buffer) {
    if (isRecording) {
      audioChunks.push(buffer);
    }
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function isCurrentlyRecording() {
    return isRecording;
  }

  return {
    startRecording,
    stopRecording,
    toggleRecording,
    collectAudioChunk,
    isCurrentlyRecording,
  };
}

module.exports = { createRecordingSummaryManager };
