// ASR audio recording (AudioWorklet) + UI + IPC event listeners

let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let pcmProcessor = null;
let isRecording = false;

const asrOverlay = document.getElementById("asr-overlay");
const asrDot = document.getElementById("asr-dot");
const asrLabel = document.getElementById("asr-label");
const asrError = document.getElementById("asr-error");
const asrStatus = document.getElementById("asr-status");
const asrLoading = document.getElementById("asr-loading");
const petGlow = document.getElementById("pet-glow");

let asrActive = false;
let injectFlashTimeout = null;

function _log(msg) {
  try { window.electronAPI._log(msg); } catch {}
}

// ─── Audio Recording ─────────────────────────────────────────────────────────

async function initAudioContext() {
  if (audioContext) return;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
    });
    _log("[ASR] Microphone permission granted");
  } catch (err) {
    _log(`[ASR] Microphone permission denied: ${err.message}`);
    showAsrError("麦克风权限被拒绝");
    throw err;
  }

  audioContext = new AudioContext({ sampleRate: 16000 });
  await audioContext.audioWorklet.addModule("pcm-processor.js");
  _log("[ASR] AudioWorklet module loaded");
}

async function startRecording() {
  if (isRecording) return;

  try {
    await initAudioContext();

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    pcmProcessor = new AudioWorkletNode(audioContext, "pcm-processor");

    pcmProcessor.port.onmessage = (event) => {
      window.electronAPI.sendAudioChunk(event.data);
    };

    sourceNode.connect(pcmProcessor);
    isRecording = true;
    _log("[ASR] Recording started");
  } catch (err) {
    _log(`[ASR] Failed to start recording: ${err.message}`);
    showAsrError(`启动录音失败: ${err.message}`);
  }
}

function stopRecording() {
  if (!isRecording) return;

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (pcmProcessor) {
    pcmProcessor.port.onmessage = null;
    pcmProcessor.disconnect();
    pcmProcessor = null;
  }

  isRecording = false;
  _log("[ASR] Recording stopped");
}

// ─── ASR UI ──────────────────────────────────────────────────────────────────

function showAsrOverlay() {
  asrOverlay.classList.add("visible");
  asrDot.classList.remove("done");
  asrLabel.textContent = "Recording...";
  asrError.style.display = "none";
  if (asrStatus) asrStatus.style.display = "none";
  asrActive = true;
}

function hideAsrOverlay() {
  asrOverlay.classList.remove("visible");
  asrActive = false;
}

function flashInjected() {
  asrDot.classList.add("done");
  asrLabel.textContent = "Injected";

  if (injectFlashTimeout) clearTimeout(injectFlashTimeout);
  injectFlashTimeout = setTimeout(() => {
    if (asrActive) {
      asrDot.classList.remove("done");
      asrLabel.textContent = "Recording...";
    } else {
      asrOverlay.classList.remove("visible");
    }
  }, 1500);
}

function showAsrError(msg) {
  asrError.textContent = msg;
  asrError.style.display = "block";
  asrOverlay.classList.add("visible");
}

function showAsrStatus(msg) {
  if (!asrStatus) return;
  asrStatus.textContent = msg;
  asrStatus.style.display = "block";
  asrError.style.display = "none";
  setTimeout(() => {
    if (asrStatus) asrStatus.style.display = "none";
  }, 5000);
}

function showLoading(label) {
  if (!asrLoading) return;
  asrLoading.classList.remove("hidden");
  const labelEl = asrLoading.querySelector(".label");
  if (labelEl) labelEl.textContent = label;
}

function hideLoading() {
  if (!asrLoading) return;
  asrLoading.classList.add("hidden");
}

// ─── IPC Event Listeners ─────────────────────────────────────────────────────

window.electronAPI.onAsrConnecting(() => {
  showLoading("正在连接...");
});

window.electronAPI.onToggleRecording((recording) => {
  if (recording) {
    showAsrOverlay();
    startRecording();
    petGlow.classList.add("recording");
  } else {
    hideLoading();
    hideAsrOverlay();
    stopRecording();
    petGlow.classList.remove("recording");
    asrActive = false;
  }
});

window.electronAPI.onAsrPartial((text) => {
  // text displayed in separate window via main process
});

window.electronAPI.onAsrFinal((text) => {
  if (asrActive) flashInjected();
});

window.electronAPI.onAsrError((msg) => {
  hideLoading();
  showAsrError(msg);
  setTimeout(() => {
    hideAsrOverlay();
  }, 5000);
});

window.electronAPI.onAsrTextInjected(() => {
  flashInjected();
});

window.electronAPI.onAsrConnected(() => {
  _log("[ASR] WebSocket connected");
  hideLoading();
  if (asrStatus) asrStatus.style.display = "none";
});

window.electronAPI.onAsrDisconnected(() => {
  _log("[ASR] WebSocket disconnected");
});

window.electronAPI.onAsrStatus((msg) => {
  _log(`[ASR] Status: ${msg}`);
  showAsrStatus(msg);
});
