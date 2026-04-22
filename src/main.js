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
let acpWindow = null;

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
    { label: "ACP 对话", click: () => { createAcpWindow(); } },
    { type: "separator" },
    { label: "设置", click: () => { windowManager.createSettings(); } },
    { type: "separator" },
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

  // ─── Settings IPC Handlers ─────────────────────────────────────────────

  ipcMain.handle("settings:load", () => {
    const prefs = loadPrefs();
    return {
      asr: {
        serverUrl: process.env.ASR_SERVER_URL || prefs?.asrServerUrl || "ws://192.168.1.66:8000",
        appkey: process.env.ASR_APPKEY || prefs?.asrAppkey || "",
      },
      pet: {
        size: prefs?.petSize || 160,
        opacity: prefs?.petOpacity || 100,
      },
      hotkeys: {
        asr: prefs?.asrHotkey || "F9",
      },
      general: {
        autostart: prefs?.autostart || false,
        rememberPosition: prefs?.rememberPosition !== false,
      },
    };
  });

  ipcMain.handle("settings:save", (_event, settings) => {
    try {
      const prefs = loadPrefs() || {};
      const updated = {
        ...prefs,
        x: win ? win.getBounds().x : prefs.x,
        y: win ? win.getBounds().y : prefs.y,
        asrServerUrl: settings.asr?.serverUrl,
        asrAppkey: settings.asr?.appkey,
        petSize: settings.pet?.size,
        petOpacity: settings.pet?.opacity,
        asrHotkey: settings.hotkeys?.asr,
        autostart: settings.general?.autostart,
        rememberPosition: settings.general?.rememberPosition,
      };
      fs.writeFileSync(PREFS_PATH, JSON.stringify(updated, null, 2));
      
      // 更新开机自启
      app.setLoginItemSettings({
        openAtLogin: settings.general?.autostart || false,
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("asr:test-connection", async (_event, serverUrl) => {
    try {
      const WebSocket = require("ws");
      const ws = new WebSocket(serverUrl);
      
      return new Promise((resolve) => {
        ws.on("open", () => {
          ws.close();
          resolve({ success: true });
        });
        ws.on("error", (err) => {
          resolve({ success: false, error: err.message });
        });
        setTimeout(() => {
          ws.close();
          resolve({ success: false, error: "连接超时" });
        }, 5000);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("hotkey:update", (_event, hotkeys) => {
    try {
      globalShortcut.unregisterAll();
      
      if (hotkeys.asr) {
        const ret = globalShortcut.register(hotkeys.asr, () => {
          asrManager.toggleRecording();
        });
        
        if (!ret) {
          console.error("[Hotkey] Failed to register hotkey:", hotkeys.asr);
        }
      }
      
      // 保存热键到偏好
      const prefs = loadPrefs() || {};
      prefs.asrHotkey = hotkeys.asr;
      fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("prefs:export", () => {
    const { dialog } = require("electron");
    const result = dialog.showSaveDialogSync({
      defaultPath: "evoleap-prefs.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    
    if (result) {
      const prefs = loadPrefs();
      fs.writeFileSync(result, JSON.stringify(prefs, null, 2));
      return { success: true, path: result };
    }
    return { success: false, error: "用户取消" };
  });

  ipcMain.handle("prefs:import", async () => {
    const { dialog } = require("electron");
    const result = dialog.showOpenDialogSync({
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    
    if (result && result[0]) {
      try {
        const imported = JSON.parse(fs.readFileSync(result[0], "utf8"));
        const currentPrefs = loadPrefs() || {};
        const merged = { ...currentPrefs, ...imported };
        fs.writeFileSync(PREFS_PATH, JSON.stringify(merged, null, 2));
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: "用户取消" };
  });

  ipcMain.handle("position:reset", () => {
    if (win && !win.isDestroyed()) {
      const { workArea } = screen.getPrimaryDisplay();
      const x = workArea.x + workArea.width - WIN_WIDTH - 20;
      const y = workArea.y + workArea.height - WIN_HEIGHT - 20;
      win.setPosition(x, y);
      savePrefs();
      return { success: true };
    }
    return { success: false, error: "窗口不存在" };
  });

  ipcMain.handle("autostart:set", (_event, enable) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enable,
      });
      const prefs = loadPrefs() || {};
      prefs.autostart = enable;
      fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.on("settings:minimize", () => {
    const settingsWin = windowManager.getSettingsWin();
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.minimize();
    }
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
  if (acpWindow && !acpWindow.isDestroyed()) acpWindow.destroy();
});

// ─── ACP Window ──────────────────────────────────────────────────────────────

function createAcpWindow() {
  // 只允许一个 ACP 窗口
  if (acpWindow && !acpWindow.isDestroyed()) {
    acpWindow.focus();
    return;
  }

  acpWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "acp", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
  });

  // 优先加载构建产物，否则尝试 dev server
  const distPath = path.join(__dirname, "..", "dist", "acp", "index.html");
  const preloadPath = path.join(__dirname, "acp", "preload.cjs");

  console.log("[ACP] Preload path:", preloadPath, "exists:", fs.existsSync(preloadPath));
  console.log("[ACP] Dist path:", distPath, "exists:", fs.existsSync(distPath));

  if (fs.existsSync(distPath)) {
    console.log("[ACP] Loading from dist");
    acpWindow.loadFile(distPath);
    acpWindow.webContents.openDevTools();
  } else {
    console.log("[ACP] Loading from dev server: http://127.0.0.1:5179");
    acpWindow.loadURL("http://127.0.0.1:5179").catch((err) => {
      console.error("[ACP] Failed to load dev server:", err);
      acpWindow.loadURL("data:text/html,<html><body style='background:#131010;color:#E7E3E1;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h2>ACP 窗口</h2><p>请先运行 <code>npm run build:acp</code> 构建，或运行 <code>npm run dev:acp</code> 启动开发服务器</p></div></body></html>");
    });
  }

  acpWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error("[ACP] Failed to load:", errorCode, errorDescription);
  });

  acpWindow.webContents.on("did-finish-load", () => {
    console.log("[ACP] Page loaded successfully");
    acpWindow.webContents.openDevTools();
  });

  // 添加快捷键打开开发者工具
  acpWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12" || (input.control && input.shift && input.key === "I")) {
      acpWindow.webContents.toggleDevTools();
    }
  });

  acpWindow.once("ready-to-show", () => {
    acpWindow.show();
    acpWindow.webContents.openDevTools();
  });

  acpWindow.on("closed", () => {
    acpWindow = null;
  });
}

// ─── ACP IPC Handlers ────────────────────────────────────────────────────────

// Mock 会话存储（内存中）
const mockSessions = new Map();
let mockSessionCounter = 0;

function ensureMockSession(id) {
  if (!mockSessions.has(id)) {
    mockSessions.set(id, {
      id,
      title: `会话 ${++mockSessionCounter}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return mockSessions.get(id);
}

ipcMain.handle("acp:send-message", async (_event, { sessionId, message }) => {
  const session = ensureMockSession(sessionId);
  session.messages.push({ role: "user", content: message, timestamp: Date.now() });
  session.updatedAt = Date.now();

  // 占位响应：延迟模拟 AI 回复
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));

  const mockReply = `这是一个占位响应。ACP 后端尚未连接。\n\n你发送了: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"\n\n未来这里会接入真实的 ACP 协议响应。`;
  session.messages.push({ role: "assistant", content: mockReply, timestamp: Date.now() });

  return { content: mockReply };
});

ipcMain.handle("acp:list-sessions", async () => {
  const list = Array.from(mockSessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
});

ipcMain.handle("acp:new-session", async (_event, opts) => {
  const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const session = {
    id,
    title: opts?.title || `会话 ${++mockSessionCounter}`,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockSessions.set(id, session);
  return session;
});

ipcMain.handle("acp:delete-session", async (_event, sessionId) => {
  mockSessions.delete(sessionId);
});

ipcMain.on("acp:minimize", () => {
  if (acpWindow && !acpWindow.isDestroyed()) acpWindow.minimize();
});

ipcMain.on("acp:maximize", () => {
  if (acpWindow && !acpWindow.isDestroyed()) {
    if (acpWindow.isMaximized()) acpWindow.unmaximize();
    else acpWindow.maximize();
  }
});

ipcMain.on("acp:close", () => {
  if (acpWindow && !acpWindow.isDestroyed()) acpWindow.close();
});
