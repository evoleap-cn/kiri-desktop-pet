const { app, BrowserWindow, screen, Menu, Tray, ipcMain, nativeImage, globalShortcut, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const dgram = require("dgram");

const TRAY_ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABN0lEQVR42u1UPWvDMBB9KlnitaR0NdRTMsTQyf/ATSBzJs8l/jshc6bMhX4snjt1yBCDwQGvodC1HdWl8qDYknVKwQa/Ubq79+6ddECPHl1HEIU8iEJOzR/YEAOAN52IIw4A79s3Jsfy75wDAHM8Zi2gghhVQoQYQX4RB4Io5DKxDOmeX2QEdV03AXM8pQsD067XDzda0tXr55kIsoC/R2XkQL4/AABGaaaNvdIFLO5dPkozJLFfFtYhiX0ksV/mK0ekIweA3WZJ3hPLxx0A4OmjYCQHqgqKoiZ35BH8N4wXkWoclFF1zwH5cdk6QBZg8zMaj+D49fNS162JS6KOkYCxe/tsI0ImF/UaLyI54e56ODN1QO48LU5z8i9Q2WgTr1zFdbZRUNV9K/YAaxJk40Rd5z16tAa/5kZ7j/ONvbEAAAAASUVORK5CYII=";

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

const WIN_WIDTH = 128;
const WIN_HEIGHT = 128;

// ─── ASR State ───────────────────────────────────────────────────────────────

let asrProcess = null;   // kiri_bridge.py process
let asrUdp = null;       // UDP socket listening for status events

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

function initAsrBridge() {
  if (asrProcess) return;

  const capswriterDir = path.join(__dirname, "..", "CapsWriter-Offline");
  const bridgePath = path.join(capswriterDir, "kiri_bridge.py");
  const pythonPath = "python";

  if (!fs.existsSync(bridgePath)) {
    console.error("[ASR] kiri_bridge.py not found!");
    if (win && !win.isDestroyed()) win.webContents.send("asr:error", "kiri_bridge.py not found");
    return;
  }

  console.log(`[ASR] Starting kiri_bridge.py...`);

  asrProcess = spawn(pythonPath, ["-u", bridgePath], {
    cwd: capswriterDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", KMP_DUPLICATE_LIB_OK: "TRUE" },
  });

  asrProcess.stdout.on("data", (data) => {
    data.toString().split("\n").filter(l => l.trim()).forEach(line => {
      console.log(`[ASR] ${line}`);
    });
  });
  asrProcess.stderr.on("data", (data) => {
    data.toString().split("\n").filter(l => l.trim()).forEach(line => {
      console.error(`[ASR stderr] ${line}`);
    });
  });
  asrProcess.on("exit", (code) => {
    console.log(`[ASR] Bridge exited: code=${code}`);
    asrProcess = null;
  });

  // ── UDP status listener ──────────────────────────────────────────────────
  if (asrUdp) { try { asrUdp.close(); } catch {} }
  asrUdp = dgram.createSocket("udp4");

  asrUdp.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf.toString("utf-8"));
      console.log(`[ASR UDP] ${JSON.stringify(msg)}`);
      if (!win || win.isDestroyed()) return;

      switch (msg.event) {
        case "loading":
          win.webContents.send("asr:status", "正在启动 ASR 服务器，请稍候...");
          break;
        case "server_ready":
          win.webContents.send("asr:status", "ASR 服务器已就绪，正在连接客户端...");
          break;
        case "ready":
          win.webContents.send("asr:server-ready");
          win.webContents.executeJavaScript("if(window.__hideAsrLoading) window.__hideAsrLoading()");
          break;
        case "recording_start":
          win.webContents.send("asr:recording-started");
          break;
        case "recording_stop":
          win.webContents.send("asr:recording-stopped");
          break;
        case "recognized":
          if (msg.text) {
            console.log(`[ASR] Recognized: "${msg.text}"`);
            win.webContents.send("asr:final-result", msg.text);
          }
          win.webContents.send("asr:recording-stopped");
          break;
        case "error":
          win.webContents.send("asr:error", msg.message || "ASR error");
          break;
      }
    } catch (e) {
      console.error("[ASR UDP] Parse error:", e.message);
    }
  });

  asrUdp.on("error", (e) => console.error("[ASR UDP] Error:", e.message));

  asrUdp.bind(6019, "127.0.0.1", () => {
    console.log("[ASR] UDP status listener bound on 127.0.0.1:6019");
  });
}

// ─── Text Injection ──────────────────────────────────────────────────────────
// Note: CapsWriter client handles its own text injection (pynput Ctrl+V).
// This function is kept for any fallback use cases.

function injectText(text) {
  if (!text || !text.trim()) return;

  try {
    const prevClipboard = clipboard.readText();
    clipboard.writeText(text);

    // Simulate Ctrl+V via PowerShell SendKeys on Windows
    if (process.platform === "win32") {
      const ps = spawn("powershell", [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")`
      ]);
      ps.on("close", () => {
        clipboard.writeText(prevClipboard);
      });
    } else if (process.platform === "darwin") {
      try {
        require("child_process").execSync(
          `osascript -e 'tell application "System Events" to keystroke "v" using command down'`
        );
      } catch {}
      clipboard.writeText(prevClipboard);
    } else {
      try {
        require("child_process").execSync("xdotool key ctrl+v");
      } catch {}
      clipboard.writeText(prevClipboard);
    }

    if (win && !win.isDestroyed()) {
      win.webContents.send("asr:text-injected", text);
    }
    console.log("[ASR] Text injected:", text);
  } catch (err) {
    console.error("[ASR] Text injection failed:", err.message);
    clipboard.writeText(text);
    if (win && !win.isDestroyed()) {
      win.webContents.send("asr:text-injected", text);
    }
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

  win.on("moved", savePrefs);
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
    // Recording is fully managed by CapsWriter Python client (CapsLock key).
    // Node only handles status queries.
    ipcMain.handle("asr:status-request", () => {
      return asrProcess ? "running" : "not_initialized";
    });

    ipcHandlersRegistered = true;
  }

  createTray();
}

app.whenReady().then(async () => {
  createWindow();

  // Start CapsWriter bridge (server + client) on app startup
  console.log("[ASR] Starting CapsWriter bridge...");
  initAsrBridge();

  app.on("activate", () => {
    if (!win || win.isDestroyed()) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (asrProcess) {
    try {
      if (process.platform === "win32") {
        // /t kills the entire process tree (bridge + server + client)
        spawn("taskkill", ["/pid", asrProcess.pid, "/f", "/t"]);
      } else {
        asrProcess.kill("SIGTERM");
      }
    } catch {}
    asrProcess = null;
  }
  if (asrUdp) { try { asrUdp.close(); } catch {} asrUdp = null; }
  globalShortcut.unregisterAll();
});
