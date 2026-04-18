const { app, BrowserWindow, screen, Menu, Tray, ipcMain, nativeImage, globalShortcut, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const WebSocket = require("ws");

// Enable high DPI support for multi-monitor configurations
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('high-dpi-support', 'true');
}

// Import ASR modules
const { injectText } = require("./asr/text-injector");
const caretTracker = require("./asr/caret-tracker");

const TRAY_ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABN0lEQVR42u1UPWvDMBB9KlnitaR0NdRTMsTQyf/ATSBzJs8l/jshc6bMhX4snjt1yBCDwQGvodC1HdWl8qDYknVKwQa/Ubq79+6ddECPHl1HEIU8iEJOzR/YEAOAN52IIw4A79s3Jsfy75wDAHM8Zi2gghhVQoQYQX4RB4Io5DKxDOmeX2QEdV03AXM8pQsD067XDzda0tXr55kIsoC/R2XkQL4/AABGaaaNvdIFLO5dPkozJLFfFtYhiX0ksV/mK0ekIweA3WZJ3hPLxx0A4OmjYCQHqgqKoiZ35BH8N4wXkWoclFF1zwH5cdk6QBZg8zMaj+D49fNS162JS6KOkYCxe/tsI0ImF/UaLyI54e56ODN1QO48LU5z8i9Q2WgTr1zFdbZRUNV9K/YAaxJk40Rd5z16tAa/5kZ7j/ONvbEAAAAASUVORK5CYII=";

// ─── ASR Configuration ──────────────────────────────────────────────────────

const ASR_CONFIG = {
  serverUrl: process.env.ASR_SERVER_URL || "ws://192.168.1.66:8000/ws/v1/asr",
  hotkey: "F9",
  sampleRate: 16000,
  heartbeatInterval: 30000, // 30s
  reconnectDelay: 3000,     // 3s
};

const PREFS_PATH = path.join(app.getPath("userData"), "evoleap-pet-prefs.json");

function loadPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    for (const key of ["x", "y"]) {
      if (key in raw && (typeof raw[key] !== "number" || !isFinite(raw[key]))) {
        raw[key] = 0;
      }
    }
    return raw;
  } catch {
    return null;
  }
}

function savePrefs() {
  if (!win || win.isDestroyed()) return;
  const { x, y } = win.getBounds();
  try { fs.writeFileSync(PREFS_PATH, JSON.stringify({ x, y })); } catch {}
}

let win;
let popupWin = null;
let tray = null;
let isQuitting = false;
let ipcHandlersRegistered = false;

const WIN_WIDTH = 160;
const WIN_HEIGHT = 160;

// ─── ASR State ───────────────────────────────────────────────────────────────

let asrWs = null;              // WebSocket connection to ASR server
let isRecording = false;        // Current recording state
let heartbeatTimer = null;      // Heartbeat timer for WebSocket
let reconnectTimer = null;      // Reconnection timer
let reconnectAttempts = 0;      // Reconnection attempt counter
const MAX_RECONNECT_ATTEMPTS = 10;
let audioBufferQueue = [];      // Queue to buffer audio before WebSocket is ready

// Overlay window for caret-following display
let overlayWin = null;
let currentAsrText = "";        // Current streaming text

// ASR Text Window - shows recognized text below pet
let asrTextWin = null;

function createAsrTextWindow() {
  if (asrTextWin && !asrTextWin.isDestroyed()) {
    asrTextWin.show();
    return;
  }

  const TEXT_WIN_WIDTH = 300;
  const TEXT_WIN_HEIGHT = 60;

  asrTextWin = new BrowserWindow({
    width: TEXT_WIN_WIDTH,
    height: TEXT_WIN_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: false,
    type: "toolbar",
    webPreferences: {
      preload: path.join(__dirname, "asr-text-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  asrTextWin.setIgnoreMouseEvents(true, { forward: true });
  asrTextWin.setAlwaysOnTop(true, "screen-saver");
  asrTextWin.loadFile(path.join(__dirname, "asr-text-window.html"));

  asrTextWin.once("ready-to-show", () => {
    // Position below pet window
    if (win && !win.isDestroyed()) {
      const petBounds = win.getBounds();
      const x = petBounds.x + Math.round((petBounds.width - TEXT_WIN_WIDTH) / 2);
      const y = petBounds.y + petBounds.height + 10;
      asrTextWin.setPosition(x, y);
    }
    asrTextWin.showInactive();
  });
}

function destroyAsrTextWindow() {
  if (asrTextWin && !asrTextWin.isDestroyed()) {
    asrTextWin.close();
    asrTextWin = null;
  }
}

function updateAsrText(text) {
  if (asrTextWin && !asrTextWin.isDestroyed()) {
    asrTextWin.webContents.send("update-asr-text", text);
  }
}

function flashAsrTextInjected() {
  if (asrTextWin && !asrTextWin.isDestroyed()) {
    asrTextWin.webContents.send("flash-asr-text-injected");
  }
}

function clampToScreen(x, y) {
  const displays = screen.getAllDisplays();
  let nearest = displays[0].workArea;
  let minDist = Infinity;
  for (const d of displays) {
    const wa = d.workArea;
    const cx = x + WIN_WIDTH / 2;
    const cy = y + WIN_HEIGHT / 2;
    const dx = Math.max(wa.x - cx, 0, cx - (wa.x + wa.width));
    const dy = Math.max(wa.y - cy, 0, cy - (wa.y + wa.height));
    const dist = dx * dx + dy * dy;
    if (dist < minDist) { minDist = dist; nearest = wa; }
  }
  return {
    x: Math.max(nearest.x, Math.min(x, nearest.x + nearest.width - WIN_WIDTH)),
    y: Math.max(nearest.y, Math.min(y, nearest.y + nearest.height - WIN_HEIGHT)),
  };
}

function createTray() {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip("EvoLeap Desktop Pet");
  const menu = Menu.buildFromTemplate([
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function destroyPopup() {
  if (popupWin) {
    try {
      if (!popupWin.isDestroyed()) {
        popupWin.close();
      }
    } catch {}
    popupWin = null;
  }
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(false);
    win.webContents.send("popup-closed");
  }
}

// ─── ASR Overlay Window ──────────────────────────────────────────────────────

function createOverlayWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.show();
    return;
  }

  overlayWin = new BrowserWindow({
    width: 400,
    height: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: false,
    type: "toolbar",
    webPreferences: {
      preload: path.join(__dirname, "overlay-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.loadFile(path.join(__dirname, "overlay-window.html"));

  overlayWin.once("ready-to-show", () => {
    overlayWin.showInactive();
  });
}

function destroyOverlayWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.close();
    overlayWin = null;
  }
}

function updateOverlayText(text) {
  currentAsrText = text;
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("update-text", text);
  }
}

function showFinalText(text) {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("show-final", text);
  }
}

function hideOverlayWindow() {
  // Clear ASR text state
  accumulatedAsrText = "";
  pendingText = "";
  
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("hide");
    // Don't destroy, keep ready for next use
  }
}

// Track last logged caret position to suppress duplicate logs
let lastLoggedCaretPos = null;

async function positionOverlayAtCaret() {
  const caretPos = await caretTracker.getCaretPosition();

  // Only log when position changes
  const posKey = caretPos ? `${caretPos.x},${caretPos.y},${caretPos.width},${caretPos.height}` : 'null';
  if (posKey !== lastLoggedCaretPos) {
    lastLoggedCaretPos = posKey;
    console.log('[CaretTracker] getCaretPosition result:', caretPos);
  }

  if (caretPos && overlayWin && !overlayWin.isDestroyed()) {
    // WinAPI (both UIA and GetGUIThreadInfo paths) returns physical pixel coordinates.
    // Electron's setPosition() expects logical (DIP) coordinates, so convert first.
    // screen.screenToDipPoint handles any multi-monitor arrangement correctly.
    const logicalPos = screen.screenToDipPoint({ x: caretPos.x, y: caretPos.y + caretPos.height });
    const x = Math.round(logicalPos.x) + 5;
    const y = Math.round(logicalPos.y) + 5;
    overlayWin.setPosition(x, y);
  } else {
    if (posKey !== lastLoggedCaretPos) {
      lastLoggedCaretPos = posKey;
      console.log('[CaretTracker] Cannot position overlay - caretPos:', !!caretPos, 'overlayWin:', !!overlayWin);
    }
  }
}

function createPopup(petWinX, petWinY) {
  if (popupWin) {
    try {
      if (!popupWin.isDestroyed()) {
        popupWin.removeAllListeners('closed');
        popupWin.close();
      }
    } catch {}
    popupWin = null;
  }

  const POPUP_W = 200;
  const POPUP_H = 280;
  const pad = 16;

  const displays = screen.getAllDisplays();
  let display = displays[0];
  let minDist = Infinity;
  const petCX = petWinX + WIN_WIDTH / 2;
  const petCY = petWinY + WIN_HEIGHT / 2;
  for (const d of displays) {
    const wa = d.workArea;
    const dx = Math.max(wa.x - petCX, 0, petCX - (wa.x + wa.width));
    const dy = Math.max(wa.y - petCY, 0, petCY - (wa.y + wa.height));
    const dist = dx * dx + dy * dy;
    if (dist < minDist) { minDist = dist; display = d; }
  }
  const { workArea } = display;

  const petTop    = petWinY;
  const petBottom = petWinY + WIN_HEIGHT;
  const petLeft   = petWinX;
  const petRight  = petWinX + WIN_WIDTH;

  let posY;
  if (petTop - workArea.y >= POPUP_H + pad) {
    posY = petTop - POPUP_H - pad;
  } else {
    posY = petBottom + pad;
  }
  posY = Math.min(posY, workArea.y + workArea.height - POPUP_H);

  let posX;
  if (petRight - POPUP_W >= workArea.x) {
    posX = petRight - POPUP_W;
  } else {
    posX = petLeft;
  }
  posX = Math.min(posX, workArea.x + workArea.width - POPUP_W);

  popupWin = new BrowserWindow({
    width: POPUP_W,
    height: POPUP_H,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    focusable: true,
    type: "toolbar",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  popupWin.setAlwaysOnTop(true, "screen-saver");
  popupWin.loadFile(path.join(__dirname, "popup.html"));

  popupWin.once("ready-to-show", () => {
    popupWin.show();
  });

  popupWin.on("blur", () => {
    setTimeout(() => {
      if (popupWin && !popupWin.isDestroyed() && !popupWin.isFocused()) {
        destroyPopup();
      }
    }, 100);
  });

  popupWin.on("closed", () => {
    popupWin = null;
  });
}

// ─── ASR Functions ───────────────────────────────────────────────────────────

function initAsrConnection() {
  if (asrWs && (asrWs.readyState === WebSocket.CONNECTING || asrWs.readyState === WebSocket.OPEN)) {
    console.log("[ASR] Connection already exists");
    return;
  }

  console.log(`[ASR] Connecting to ${ASR_CONFIG.serverUrl}...`);
  
  asrWs = new WebSocket(ASR_CONFIG.serverUrl);

  asrWs.on("open", () => {
    console.log("[ASR] WebSocket connected");
    reconnectAttempts = 0;

    // Send StartTranscription message
    const startMsg = {
      header: {
        namespace: "SpeechTranscriber",
        name: "StartTranscription",
        appkey: process.env.ASR_APPKEY || "default"
      },
      payload: {
        format: "pcm",
        sample_rate: ASR_CONFIG.sampleRate,
        enable_intermediate_result: true,
        enable_punctuation_prediction: true,
        enable_inverse_text_normalization: true
      }
    };
    asrWs.send(JSON.stringify(startMsg));

    // Send any buffered audio chunks
    if (audioBufferQueue.length > 0) {
      console.log(`[ASR] Sending ${audioBufferQueue.length} buffered audio chunks`);
      for (const bufferedChunk of audioBufferQueue) {
        asrWs.send(bufferedChunk, { binary: true });
      }
      audioBufferQueue = [];
    }

    // Start heartbeat
    startHeartbeat();

    // Notify renderer
    if (win && !win.isDestroyed()) {
      win.webContents.send("asr:connected");
    }
  });

  asrWs.on("message", (data, isBinary) => {
    try {
      const textData = typeof data === 'string' ? data : data.toString('utf8');
      const msg = JSON.parse(textData);
      const header = msg.header || {};

      if (header.name === "TranscriptionStarted") {
        console.log("[ASR] Transcription started successfully");
        // Reset accumulated text when transcription starts
        accumulatedAsrText = "";
        pendingText = "";
      } else if (header.name === "SentenceBegin") {
        // A new sentence segment has started
        // If we have pending text from previous segment, inject it
        if (pendingText && pendingText.trim()) {
          console.log(`[ASR] SentenceBegin - injecting previous segment: "${pendingText}"`);
          // Inject previous segment immediately
          injectText(pendingText)
            .then(() => {
              console.log('[ASR] Previous segment injected successfully');
            })
            .catch(err => {
              console.error('[ASR] Failed to inject previous segment:', err.message);
            });
          // Add space/separator between segments
          accumulatedAsrText += " ";
        }
        // Start new sentence
        pendingText = "";
        
        console.log("[ASR] Sentence begin detected");
        if (win && !win.isDestroyed()) {
          win.webContents.send("asr:sentence-begin");
        }
      } else if (header.name === "TranscriptionResultChanged") {
        // Partial/intermediate result - accumulate text
        const text = msg.payload?.result || "";
        if (text) {
          pendingText = text;
          const fullText = accumulatedAsrText + text;
          updateOverlayText(fullText);
          updateAsrText(fullText);
          positionOverlayAtCaret();
          if (win && !win.isDestroyed()) {
            win.webContents.send("asr:partial-result", fullText);
          }
        }
      } else if (header.name === "SentenceEnd") {
        // ASR server VAD detected end of sentence - inject pending text immediately
        const serverText = msg.payload?.result || "";
        console.log(`[ASR] SentenceEnd received, server result: "${serverText}"`);
        
        // Use server's result if available, otherwise use our pendingText
        const textToInject = serverText || pendingText;
        if (textToInject && textToInject.trim()) {
          console.log(`[ASR] SentenceEnd - injecting: "${textToInject}"`);
          injectText(textToInject)
            .then(() => {
              console.log('[ASR] SentenceEnd text injected successfully');
              flashAsrTextInjected();
            })
            .catch(err => {
              console.error('[ASR] Failed to inject SentenceEnd text:', err.message);
            });
          // Clear pending text after injection
          accumulatedAsrText += (accumulatedAsrText ? " " : "") + textToInject;
          pendingText = "";
        }
        
        // Hide overlay window immediately after SentenceEnd
        hideOverlayWindow();
      } else if (header.name === "TranscriptionCompleted") {
        // Final result - inject any remaining text
        const text = msg.payload?.result || "";
        console.log(`[ASR] TranscriptionCompleted received: "${text}"`);
        asrFinalResultReceived = true;
        
        const finalText = (accumulatedAsrText + " " + (text || pendingText)).trim();
        
        if (finalText && finalText !== accumulatedAsrText.trim()) {
          console.log(`[ASR] Injecting final text: "${finalText}"`);
          injectText(finalText)
            .then(() => {
              console.log('[ASR] Final text injected successfully');
            })
            .catch(err => {
              console.error('[ASR] Failed to inject final text:', err.message);
            });
        }
        if (win && !win.isDestroyed()) {
          win.webContents.send("asr:final-result", text);
        }
        
        // Close connection after receiving final result
        if (closeResolve) {
          console.log("[ASR] Final result received, closing connection");
          finalizeClose();
        }
      } else if (header.name === "TaskFailed") {
        const errorMsg = msg.payload?.status_text || "ASR task failed";
        console.error("[ASR] Task failed:", errorMsg);
        if (win && !win.isDestroyed()) {
          win.webContents.send("asr:error", errorMsg);
        }
      } else {
        // Debug: log unhandled message types
        console.log(`[ASR] Unhandled message type: ${header.name || 'unknown'}`, JSON.stringify(msg, null, 2));
      }
    } catch (e) {
      console.error(`[ASR] Message parse error: ${e.message}`);
    }
  });

  asrWs.on("error", (error) => {
    console.error("[ASR] WebSocket error:", error.message);
    if (win && !win.isDestroyed()) {
      win.webContents.send("asr:error", error.message);
      // Show connection quality warning before connection succeeds
      if (reconnectAttempts === 0) {
        win.webContents.send("asr:status", "连接质量差，正在尝试重连...");
      }
    }
  });

  asrWs.on("close", (code, reason) => {
    console.log(`[ASR] WebSocket closed: code=${code}, reason=${reason}`);
    stopHeartbeat();

    if (win && !win.isDestroyed()) {
      win.webContents.send("asr:disconnected");
      // Show connection quality warning during reconnection
      if (isRecording && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        win.webContents.send("asr:status", "连接已断开，正在重连...");
      }
    }

    // Attempt reconnection if still recording
    if (isRecording && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`[ASR] Reconnecting... attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send("asr:status", `正在重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      }
      reconnectTimer = setTimeout(() => {
        initAsrConnection();
      }, ASR_CONFIG.reconnectDelay);
    }
  });
}

// State tracking for ASR
let asrFinalResultReceived = false;
let closeResolve = null;
let accumulatedAsrText = "";  // Accumulate text from sentence segments
let pendingText = "";         // Current segment text

function closeAsrConnection() {
  return new Promise((resolve) => {
    if (!asrWs) {
      resolve();
      return;
    }

    stopHeartbeat();
    closeResolve = resolve;

    // Set flag to track when final result is received
    asrFinalResultReceived = false;

    if (asrWs.readyState === WebSocket.OPEN) {
      // Send StopTranscription but DON'T close immediately
      const stopMsg = {
        header: {
          namespace: "SpeechTranscriber",
          name: "StopTranscription"
        }
      };
      asrWs.send(JSON.stringify(stopMsg));
      console.log("[ASR] StopTranscription sent, waiting for final result...");

      // Wait for final result or timeout
      setTimeout(() => {
        if (!asrFinalResultReceived) {
          console.log("[ASR] Timeout waiting for final result, closing connection");
        }
        finalizeClose();
      }, 2000); // 2 second timeout
    } else {
      finalizeClose();
    }
  });
}

function finalizeClose() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  audioBufferQueue = [];
  if (asrWs) {
    asrWs.close();
    asrWs = null;
  }
  if (closeResolve) {
    closeResolve();
    closeResolve = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (asrWs && asrWs.readyState === WebSocket.OPEN) {
      asrWs.ping(); // WebSocket ping/pong
    }
  }, ASR_CONFIG.heartbeatInterval);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function sendAudioChunk(buffer) {
  if (asrWs && asrWs.readyState === WebSocket.OPEN) {
    // Send as binary frame (required by ASR server)
    // buffer is Int16Array, convert to Buffer for WebSocket
    // Note: Need to copy because the ArrayBuffer might be reused
    const bufferToSend = Buffer.from(new Uint8Array(buffer.buffer));
    asrWs.send(bufferToSend, { binary: true });
  } else if (asrWs && asrWs.readyState === WebSocket.CONNECTING) {
    // WebSocket is connecting, buffer the audio
    const bufferToQueue = Buffer.from(new Uint8Array(buffer.buffer));
    audioBufferQueue.push(bufferToQueue);
    console.log(`[ASR] Queuing audio chunk, queue size: ${audioBufferQueue.length}`);
  }
}

// ─── Hotkey Handler ──────────────────────────────────────────────────────────

function registerHotkey() {
  const ret = globalShortcut.register(ASR_CONFIG.hotkey, () => {
    console.log(`[ASR] Hotkey ${ASR_CONFIG.hotkey} pressed`);
    isRecording = !isRecording;

    if (isRecording) {
      // Start recording
      initAsrConnection();
      createOverlayWindow();
      createAsrTextWindow();
      // Start caret tracking
      caretTracker.startTracking(100, (caretPos) => {
        positionOverlayAtCaret();
      });
      if (win && !win.isDestroyed()) {
        win.webContents.send("asr:recording-started");
      }
    } else {
      // Stop recording - inject any remaining pending text first
      if (pendingText && pendingText.trim()) {
        console.log(`[ASR] Stop recording - injecting remaining text: "${pendingText}"`);
        const textToInject = (accumulatedAsrText + " " + pendingText).trim();
        injectText(textToInject)
          .then(() => console.log('[ASR] Remaining text injected'))
          .catch(err => console.error('[ASR] Failed to inject remaining text:', err.message));
      }

      closeAsrConnection().then(() => {
        caretTracker.stopTracking();
        hideOverlayWindow();
        destroyAsrTextWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("asr:recording-stopped");
        }
      });
    }
  });

  if (!ret) {
    console.error(`[ASR] Failed to register hotkey: ${ASR_CONFIG.hotkey}`);
  } else {
    console.log(`[ASR] Hotkey ${ASR_CONFIG.hotkey} registered`);
  }
}

// ─── Main window ─────────────────────────────────────────────────────────────

function createWindow() {
  const prefs = loadPrefs();

  let startX, startY;
  if (prefs) {
    const clamped = clampToScreen(prefs.x, prefs.y);
    startX = clamped.x;
    startY = clamped.y;
  } else {
    const { workArea } = screen.getPrimaryDisplay();
    startX = workArea.x + workArea.width - WIN_WIDTH - 20;
    startY = workArea.y + workArea.height - WIN_HEIGHT - 20;
  }

  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    type: "toolbar",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setFocusable(true);
  win.loadFile(path.join(__dirname, "index.html"));
  win.showInactive();
  win.moveTop();

  win.on("move", () => {
    savePrefs();
    if (asrTextWin && !asrTextWin.isDestroyed()) {
      const petBounds = win.getBounds();
      const x = petBounds.x + Math.round((petBounds.width - 300) / 2);
      const y = petBounds.y + petBounds.height + 10;
      asrTextWin.setPosition(x, y);
    }
  });
  win.on("closed", () => {
    destroyPopup();
    win = null;
  });

  if (!ipcHandlersRegistered) {
    // Existing IPC handlers
    ipcMain.on("move-window-by", (_event, dx, dy) => {
      if (!win || win.isDestroyed()) return;
      const { x, y } = win.getBounds();
      const clamped = clampToScreen(x + dx, y + dy);
      win.setBounds({ ...clamped, width: WIN_WIDTH, height: WIN_HEIGHT });
    });

    ipcMain.on("drag-start", () => {
      if (!win || win.isDestroyed()) return;
      win.setIgnoreMouseEvents(false);
    });

    ipcMain.on("drag-end", () => {
      savePrefs();
    });

    ipcMain.on("set-ignore-mouse", (_event, ignore) => {
      if (!win || win.isDestroyed()) return;
      if (ignore) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
    });

    ipcMain.on("open-menu", () => {
      if (!win || win.isDestroyed()) return;
      if (popupWin && !popupWin.isDestroyed()) {
        destroyPopup();
        return;
      }
      const bounds = win.getBounds();
      createPopup(bounds.x, bounds.y);
    });

    ipcMain.on("close-menu", () => {
      destroyPopup();
    });

    ipcMain.on("menu-action", (_event, action) => {
      console.log("Menu action triggered:", action);
      destroyPopup();
    });

    ipcMain.on("open-context-menu", (_event, screenX, screenY) => {
      const template = [
        { label: "Reset Position", click: () => {
          if (win && !win.isDestroyed()) {
            const { workArea } = screen.getPrimaryDisplay();
            const x = workArea.x + workArea.width - WIN_WIDTH - 20;
            const y = workArea.y + workArea.height - WIN_HEIGHT - 20;
            win.setPosition(x, y);
            savePrefs();
          }
        }},
        { type: "separator" },
        { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
      ];
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ x: screenX, y: screenY });
    });

    ipcMain.on("pet-window-bounds", (event) => {
      event.returnValue = win ? win.getBounds() : null;
    });

    // Renderer log forwarding
    ipcMain.on("renderer-log", (_event, msg) => {
      console.log(`[Renderer] ${msg}`);
    });

    // ─── ASR IPC handlers ──────────────────────────────────────────────────
    ipcMain.handle("asr:status-request", () => {
      return asrWs && asrWs.readyState === WebSocket.OPEN ? "connected" : "disconnected";
    });

    ipcMain.on("asr:send-audio-chunk", (_event, buffer) => {
      sendAudioChunk(buffer);
    });

    ipcHandlersRegistered = true;
  }

  createTray();
}

app.whenReady().then(async () => {
  createWindow();

  // Register F9 hotkey for ASR recording
  console.log("[ASR] Registering hotkey F9...");
  registerHotkey();

  app.on("activate", () => {
    if (!win || win.isDestroyed()) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  closeAsrConnection();
  caretTracker.stopTracking();
  destroyOverlayWindow();
  globalShortcut.unregisterAll();
});
