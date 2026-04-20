const { app, BrowserWindow, screen, Menu, Tray, ipcMain, nativeImage, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");

const { injectText } = require("./asr/text-injector");
const caretTracker = require("./asr/caret-tracker");
const { createWindowManager } = require("./windows/window-manager");
const { createAsrManager } = require("./asr/asr-manager");

if (process.platform === "win32") {
  app.commandLine.appendSwitch("high-dpi-support", "true");
}

const TRAY_ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABN0lEQVR42u1UPWvDMBB9KlnitaR0NdRTMsTQyf/ATSBzJs8l/jshc6bMhX4snjt1yBCDwQGvodC1HdWl8qDYknVKwQa/Ubq79+6ddECPHl1HEIU8iEJOzR/YEAOAN52IIw4A79s3Jsfy75wDAHM8Zi2gghhVQoQYQX4RB4Io5DKxDOmeX2QEdV03AXM8pQsD067XDzda0tXr55kIsoC/R2XkQL4/AABGaaaNvdIFLO5dPkozJLFfFtYhiX0ksV/mK0ekIweA3WZJ3hPLxx0A4OmjYCQHqgqKoiZ35BH8N4wXkWoclFF1zwH5cdk6QBZg8zMaj+D49fNS162JS6KOkYCxe/tsI0ImF/UaLyI54e56ODN1QO48LU5z8i9Q2WgTr1zFdbZRUNV9K/YAaxJk40Rd5z16tAa/5kZ7j/ONvbEAAAAASUVORK5CYII=";

const WIN_WIDTH = 160;
const WIN_HEIGHT = 160;
const PREFS_PATH = path.join(app.getPath("userData"), "evoleap-pet-prefs.json");

let win;
let tray = null;
let isQuitting = false;
let ipcHandlersRegistered = false;

// ─── Prefs ───────────────────────────────────────────────────────────────────

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

// ─── Tray ────────────────────────────────────────────────────────────────────

function createTray() {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip("EvoLeap Desktop Pet");
  const menu = Menu.buildFromTemplate([
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ─── Main Window ─────────────────────────────────────────────────────────────

function createWindow() {
  const prefs = loadPrefs();
  let startX, startY;

  if (prefs) {
    const clamped = windowManager.clampToScreen(prefs.x, prefs.y);
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
    windowManager.syncAsrTextWindowPosition();
  });

  win.on("closed", () => {
    windowManager.destroyPopup();
    win = null;
  });

  if (!ipcHandlersRegistered) {
    registerIpcHandlers();
    ipcHandlersRegistered = true;
  }

  createTray();
}

function registerIpcHandlers() {
  ipcMain.on("move-window-by", (_event, dx, dy) => {
    if (!win || win.isDestroyed()) return;
    const { x, y } = win.getBounds();
    const clamped = windowManager.clampToScreen(x + dx, y + dy);
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
    const bounds = win.getBounds();
    windowManager.createPopup(bounds.x, bounds.y);
  });

  ipcMain.on("close-menu", () => {
    windowManager.destroyPopup();
  });

  ipcMain.on("menu-action", (_event, action) => {
    console.log("Menu action triggered:", action);
    windowManager.destroyPopup();
  });

  ipcMain.on("open-context-menu", (_event, screenX, screenY) => {
    const template = [
      {
        label: "Reset Position",
        click: () => {
          if (win && !win.isDestroyed()) {
            const { workArea } = screen.getPrimaryDisplay();
            const x = workArea.x + workArea.width - WIN_WIDTH - 20;
            const y = workArea.y + workArea.height - WIN_HEIGHT - 20;
            win.setPosition(x, y);
            savePrefs();
          }
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ x: screenX, y: screenY });
  });

  ipcMain.on("pet-window-bounds", (event) => {
    event.returnValue = win ? win.getBounds() : null;
  });

  ipcMain.on("renderer-log", (_event, msg) => {
    console.log(`[Renderer] ${msg}`);
  });

  ipcMain.handle("asr:status-request", () => {
    return asrManager.isConnected() ? "connected" : "disconnected";
  });

  ipcMain.on("asr:send-audio-chunk", (_event, buffer) => {
    asrManager.sendAudioChunk(buffer);
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

const windowManager = createWindowManager({
  getWin: () => win,
  caretTracker,
});

const asrManager = createAsrManager({
  getWin: () => win,
  windowManager,
  injectText,
  caretTracker,
});

app.whenReady().then(() => {
  createWindow();
  console.log("[ASR] Registering hotkey F9...");
  asrManager.registerHotkey();

  app.on("activate", () => {
    if (!win || win.isDestroyed()) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  asrManager.closeAsrConnection();
  caretTracker.stopTracking();
  windowManager.destroyOverlayWindow();
  globalShortcut.unregisterAll();
});
