const SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><style>.cls-1{fill:#fff;}.cls-2{fill:#235ceb;}</style></defs><g id="图层_2" data-name="图层 2"><g id="图层_1-2" data-name="图层 1"><rect class="cls-1" width="512" height="512" rx="128"/></g><g id="图层_2-2" data-name="图层 2"><polygon class="cls-2" points="242.86 208.88 385.45 208.88 385.45 308.7 242.86 308.7 242.86 346.12 385.45 346.12 385.45 445.94 242.86 445.94 242.86 445.96 143.68 445.96 143.68 71.61 242.86 71.61 242.86 208.88"/><rect class="cls-2" x="286.27" y="71.61" width="99.18" height="99.82"/></g></g></svg>`;

const PAD_X = 8;
const PAD_Y = 8;
const SVG_W = 80;
const SVG_H = 80;

let hitCtx = null;

function buildHitCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SVG_W;
  canvas.height = SVG_H;
  hitCtx = canvas.getContext("2d");

  const blob = new Blob([SVG_MARKUP], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    hitCtx.clearRect(0, 0, SVG_W, SVG_H);
    hitCtx.drawImage(img, 0, 0, SVG_W, SVG_H);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function isOpaqueAt(winX, winY) {
  if (!hitCtx) return true;
  const svgX = winX - PAD_X;
  const svgY = winY - PAD_Y;
  if (svgX < 0 || svgY < 0 || svgX >= SVG_W || svgY >= SVG_H) return false;
  const pixel = hitCtx.getImageData(Math.floor(svgX), Math.floor(svgY), 1, 1).data;
  return pixel[3] > 10;
}

// Insert SVG into page
const pet = document.getElementById("pet");
pet.innerHTML = SVG_MARKUP;

buildHitCanvas();

// Drag state
let isDragging = false;
let mouseDownX = 0;
let mouseDownY = 0;

// Store pet screen position for menu
let petScreenX = 0;
let petScreenY = 0;

let lastIgnore = null;

function setIgnore(ignore) {
  if (ignore !== lastIgnore) {
    lastIgnore = ignore;
    window.electronAPI.setIgnoreMouse(ignore);
  }
}

window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (!isOpaqueAt(e.clientX, e.clientY)) return;
  // Record pet's screen position for menu positioning
  petScreenX = e.screenX;
  petScreenY = e.screenY;
  isDragging = false;
  mouseDownX = e.screenX;
  mouseDownY = e.screenY;
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  const opaque = isOpaqueAt(e.clientX, e.clientY);
  setIgnore(!opaque && !isDragging);

  if (isDragging) {
    const dx = e.screenX - mouseDownX;
    const dy = e.screenY - mouseDownY;
    if (dx !== 0 || dy !== 0) {
      window.electronAPI.moveWindowBy(dx, dy);
      mouseDownX = e.screenX;
      mouseDownY = e.screenY;
    }
  } else if (mouseDownX !== 0) {
    const dx = e.screenX - mouseDownX;
    const dy = e.screenY - mouseDownY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      isDragging = true;
      window.electronAPI.dragStart();
    }
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;

  if (isDragging) {
    isDragging = false;
    window.electronAPI.dragEnd();
    const opaque = isOpaqueAt(e.clientX, e.clientY);
    setIgnore(!opaque);
    mouseDownX = 0;
    mouseDownY = 0;
    return;
  }

  const dx = e.screenX - mouseDownX;
  const dy = e.screenY - mouseDownY;
  mouseDownX = 0;
  mouseDownY = 0;

  if (Math.abs(dx) <= 5 && Math.abs(dy) <= 5) {
    window.electronAPI.openMenu();
    return;
  }

  const opaque = isOpaqueAt(e.clientX, e.clientY);
  setIgnore(!opaque);
});

window.addEventListener("mouseleave", () => {
  if (!isDragging) setIgnore(true);
});

// Right-click opens native context menu
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.electronAPI.openContextMenu(e.screenX, e.screenY);
});

// When popup closes, reset lastIgnore so the next mouse event always re-evaluates
window.electronAPI.onPopupClosed(() => {
  lastIgnore = null;
});

// ─── ASR Overlay ─────────────────────────────────────────────────────────────

const asrOverlay = document.getElementById("asr-overlay");
const asrDot = document.getElementById("asr-dot");
const asrLabel = document.getElementById("asr-label");
const asrText = document.getElementById("asr-text");
const asrError = document.getElementById("asr-error");
const asrStatus = document.getElementById("asr-status");
const asrLoading = document.getElementById("asr-loading");

let asrActive = false;
let injectFlashTimeout = null;
let asrLoadingVisible = false;

function showLoading(label) {
  if (!asrLoading || asrLoadingVisible) return;
  asrLoading.classList.remove("hidden");
  asrLoadingVisible = true;
  if (label) {
    const labelEl = asrLoading.querySelector(".label");
    if (labelEl) labelEl.textContent = label;
  }
}

function hideLoading() {
  if (!asrLoading) return;
  asrLoading.classList.add("hidden");
  asrLoadingVisible = false;
  console.log("[Renderer] hideLoading() called, element:", asrLoading, "classes:", asrLoading.className);
}

// Expose to global for main process executeJavaScript fallback
window.__hideAsrLoading = hideLoading;

function _log(msg) {
  try { window.electronAPI._log(msg); } catch {}
}

function showAsrOverlay() {
  asrOverlay.classList.add("visible");
  asrDot.classList.remove("done");
  asrLabel.textContent = "Recording...";
  asrText.textContent = "";
  asrText.classList.remove("injected");
  asrError.style.display = "none";
  if (asrStatus) asrStatus.style.display = "none";
  asrActive = true;
}

function hideAsrOverlay() {
  asrOverlay.classList.remove("visible");
  asrActive = false;
}

function setAsrText(text) {
  asrText.textContent = text;
  asrText.classList.remove("injected");
}

function flashInjected() {
  asrDot.classList.add("done");
  asrLabel.textContent = "Injected";
  asrText.classList.add("injected");

  if (injectFlashTimeout) clearTimeout(injectFlashTimeout);
  injectFlashTimeout = setTimeout(() => {
    asrOverlay.classList.remove("visible");
  }, 1200);
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
  // Auto-hide status after 5 seconds
  setTimeout(() => {
    if (asrStatus) asrStatus.style.display = "none";
  }, 5000);
}

// ─── ASR IPC Events ──────────────────────────────────────────────────────────

// Recording overlay: red pulsing ring when CapsWriter is recording
let recordingOverlay = null;

function showRecordingOverlay() {
  if (!recordingOverlay) {
    recordingOverlay = document.createElement("div");
    recordingOverlay.id = "recording-overlay";
    recordingOverlay.style.cssText = `
      position: fixed; top: 24px; left: 24px;
      width: 80px; height: 80px;
      border-radius: 20px;
      background: transparent;
      box-sizing: border-box;
      z-index: 10001;
      pointer-events: none;
      animation: siri-glow 3s linear infinite;
    `;
    if (!document.getElementById("recording-overlay-style")) {
      const style = document.createElement("style");
      style.id = "recording-overlay-style";
      style.textContent = `
        @keyframes siri-glow {
          0%   { box-shadow: 0 0 0 2.5px #ff3cac, 0 0 14px 4px rgba(255,60,172,0.55); }
          14%  { box-shadow: 0 0 0 2.5px #ff8c00, 0 0 14px 4px rgba(255,140,0,0.55); }
          28%  { box-shadow: 0 0 0 2.5px #ffe000, 0 0 14px 4px rgba(255,224,0,0.55); }
          42%  { box-shadow: 0 0 0 2.5px #40e0d0, 0 0 14px 4px rgba(64,224,208,0.55); }
          57%  { box-shadow: 0 0 0 2.5px #00b4ff, 0 0 14px 4px rgba(0,180,255,0.55); }
          71%  { box-shadow: 0 0 0 2.5px #9b59ff, 0 0 14px 4px rgba(155,89,255,0.55); }
          85%  { box-shadow: 0 0 0 2.5px #ff3cac, 0 0 14px 4px rgba(255,60,172,0.55); }
          100% { box-shadow: 0 0 0 2.5px #ff3cac, 0 0 14px 4px rgba(255,60,172,0.55); }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(recordingOverlay);
  }
  recordingOverlay.style.display = "block";
}

function hideRecordingOverlay() {
  if (recordingOverlay) recordingOverlay.style.display = "none";
}

window.electronAPI.onAsrRecordingStarted(() => {
  hideLoading();
  showRecordingOverlay();
  showAsrOverlay();
});

window.electronAPI.onAsrRecordingStopped(() => {
  hideRecordingOverlay();
  if (asrActive) {
    flashInjected();
  }
});

window.electronAPI.onAsrPartial((text) => {
  if (asrActive) {
    setAsrText(text);
  }
});

window.electronAPI.onAsrFinal((text) => {
  if (asrActive) {
    setAsrText(text);
    flashInjected();
  }
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

window.electronAPI.onAsrStatus((msg) => {
  console.log(`[Renderer] asr:status received: "${msg}"`);
  showAsrStatus(msg);
  // If status mentions loading, show spinner overlay
  if (msg.includes("正在启动") || msg.includes("等待") || msg.includes("Loading") || msg.includes("正在加载")) {
    showLoading("加载中...");
  } else if (msg.includes("就绪") || msg.includes("Ready")) {
    console.log("[Renderer] Hiding loading spinner (server ready)");
    hideLoading();
  }
});

// Direct signal: WS connected → hide spinner immediately
window.electronAPI.onAsrServerReady(() => {
  console.log("[Renderer] asr:server-ready event received, hiding spinner");
  hideLoading();
});
