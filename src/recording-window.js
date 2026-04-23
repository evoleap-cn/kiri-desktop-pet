// Recording window renderer
// Handles: waveform animation, audio capture, duration timer, stop button

// ─── Waveform (ported from WaveformDivs.jsx) ─────────────────────────────────

const WAVEFORM = {
  TIME_BETWEEN_BARS: 100,
  SPEED_OF_BARS: 50,
  BAR_WIDTH: 3,
  BAR_SPACING: 5,
  BAR_MAX_HEIGHT: 36,
  MAX_BARS: 200,
  VOLUME_BOOST: 3,
  COMPRESSION_EXPONENT: 0.6,
  NOISE_GATE: 0.02,
};

const waveformEl = document.getElementById('waveform');
let bars = [];
let barIdCounter = 0;
let startTime = null;
let lastBarIndex = -1;
let animFrameId = null;
let currentVolume = 0;

function compressVolume(vol) {
  if (vol < WAVEFORM.NOISE_GATE) return 0;
  const adj = (vol - WAVEFORM.NOISE_GATE) / (1 - WAVEFORM.NOISE_GATE);
  const compressed = Math.pow(adj, WAVEFORM.COMPRESSION_EXPONENT);
  return Math.min(1, Math.max(0, compressed * WAVEFORM.VOLUME_BOOST));
}

function maxBars() {
  const w = waveformEl.offsetWidth || 300;
  // must be >= w*2/BAR_SPACING so trimming never removes still-visible bars
  return Math.ceil(w * 2 / WAVEFORM.BAR_SPACING) + 10;
}

function createBarEl(id) {
  const el = document.createElement('div');
  el.className = 'waveform-bar';
  el.id = id;
  el.style.height = '0px';
  waveformEl.appendChild(el);
  return el;
}

function waveformAnimate() {
  const now = Date.now();
  const containerWidth = waveformEl.offsetWidth || 300;
  const globalOffset = startTime ? (now - startTime) / 1000 * WAVEFORM.SPEED_OF_BARS : 0;
  const elapsed = now - startTime;
  const currentBarIndex = Math.floor(elapsed / WAVEFORM.TIME_BETWEEN_BARS);

  if (currentBarIndex > lastBarIndex) {
    const vol = compressVolume(currentVolume);
    for (let i = lastBarIndex + 1; i <= currentBarIndex; i++) {
      const theoreticalOffset = i * WAVEFORM.BAR_SPACING;
      const id = `bar-${barIdCounter++}`;
      const bar = { id, createdOffset: theoreticalOffset, targetHeight: Math.max(0.05, vol) };
      bars.push(bar);

      // Trim oldest bars and remove their DOM elements
      const m = maxBars();
      if (bars.length > m) {
        const removed = bars.splice(0, bars.length - m);
        removed.forEach(b => {
          const el = document.getElementById(b.id);
          if (el) el.remove();
        });
      }

      const el = createBarEl(id);
      requestAnimationFrame(() => {
        if (el.parentNode) el.style.height = `${bar.targetHeight * WAVEFORM.BAR_MAX_HEIGHT}px`;
      });
    }
    lastBarIndex = currentBarIndex;
  }

  // Update positions and remove off-screen bars
  bars = bars.filter(bar => {
    const pos = globalOffset - bar.createdOffset;
    if (pos > containerWidth * 2) {
      const el = document.getElementById(bar.id);
      if (el) el.remove();
      return false;
    }
    const el = document.getElementById(bar.id);
    if (el) el.style.setProperty('--bar-pos', pos);
    return true;
  });

  animFrameId = requestAnimationFrame(waveformAnimate);
}

function startWaveform() {
  bars = [];
  barIdCounter = 0;
  startTime = Date.now();
  lastBarIndex = -1;
  waveformEl.innerHTML = '';
  animFrameId = requestAnimationFrame(waveformAnimate);
}

function stopWaveform() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  waveformEl.innerHTML = '';
  bars = [];
  startTime = null;
  lastBarIndex = -1;
}

// ─── Duration Timer ───────────────────────────────────────────────────────────

const durationEl = document.getElementById('duration');
let durationSeconds = 0;
let durationInterval = null;

function formatDuration(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function startTimer() {
  durationSeconds = 0;
  durationEl.textContent = '00:00';
  durationInterval = setInterval(() => {
    durationSeconds++;
    durationEl.textContent = formatDuration(durationSeconds);
  }, 1000);
}

function stopTimer() {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
}

// ─── Audio Capture ────────────────────────────────────────────────────────────

let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let analyserNode = null;
let pcmProcessor = null;
let volumePollId = null;

async function startAudio() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
    });

    audioContext = new AudioContext({ sampleRate: 16000 });
    await audioContext.audioWorklet.addModule('pcm-processor.js');

    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // AnalyserNode for volume monitoring
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    sourceNode.connect(analyserNode);

    // AudioWorklet for PCM collection
    pcmProcessor = new AudioWorkletNode(audioContext, 'pcm-processor');
    pcmProcessor.port.onmessage = (e) => {
      window.recordingAPI.sendAudioChunk(e.data);
    };
    sourceNode.connect(pcmProcessor);

    // Poll volume from analyser
    const dataArray = new Float32Array(analyserNode.fftSize);
    volumePollId = setInterval(() => {
      analyserNode.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      currentVolume = Math.sqrt(sum / dataArray.length);
    }, 50);

  } catch (err) {
    console.error('[Recording] Failed to start audio:', err);
  }
}

function stopAudio() {
  if (volumePollId) { clearInterval(volumePollId); volumePollId = null; }
  currentVolume = 0;

  if (pcmProcessor) { pcmProcessor.port.onmessage = null; pcmProcessor.disconnect(); pcmProcessor = null; }
  if (analyserNode) { analyserNode.disconnect(); analyserNode = null; }
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
}

// ─── Recording lifecycle ──────────────────────────────────────────────────────

function startRecording() {
  startWaveform();
  startTimer();
  startAudio();
}

function stopRecording() {
  stopWaveform();
  stopTimer();
  stopAudio();
}

// ─── Window slide-in animation ──────────────────────────────────────────────

// Trigger slide-in animation after page load
requestAnimationFrame(() => {
  document.getElementById('container').classList.add('visible');
});

// ─── IPC ─────────────────────────────────────────────────────────────────────

window.recordingAPI.onRecordingStarted(() => {
  startRecording();
});

window.recordingAPI.onRecordingStopped(() => {
  stopRecording();
});

document.getElementById('stop-btn').addEventListener('click', () => {
  const container = document.getElementById('container');
  container.classList.remove('visible');
  container.classList.add('slide-out');

  // Wait for animation to complete before hiding window
  setTimeout(() => {
    window.recordingAPI.stopRecording();
  }, 500);
});

// Auto-start since window is shown only when recording begins
startRecording();
