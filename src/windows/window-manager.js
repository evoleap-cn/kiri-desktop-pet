const { BrowserWindow, screen, Menu } = require("electron");
const path = require("path");

const WIN_WIDTH = 160;
const WIN_HEIGHT = 160;

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

function createWindowManager({ getWin, caretTracker }) {
  let overlayWin = null;
  let asrTextWin = null;
  let popupWin = null;
  let settingsWin = null;
  let recordingWin = null;
  let taskWin = null;
  let expertReviewWin = null;
  let lastLoggedCaretPos = null;

  // 专家审核结果回调 Promise
  let expertReviewResolver = null;
  let expertReviewRejector = null;

  // ─── ASR Text Window ────────────────────────────────────────────────────────

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
        preload: path.join(__dirname, "..", "asr-text-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    asrTextWin.setIgnoreMouseEvents(true, { forward: true });
    asrTextWin.setAlwaysOnTop(true, "screen-saver");
    asrTextWin.loadFile(path.join(__dirname, "..", "asr-text-window.html"));

    asrTextWin.once("ready-to-show", () => {
      const win = getWin();
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

  function syncAsrTextWindowPosition() {
    const win = getWin();
    if (asrTextWin && !asrTextWin.isDestroyed() && win && !win.isDestroyed()) {
      const petBounds = win.getBounds();
      const x = petBounds.x + Math.round((petBounds.width - 300) / 2);
      const y = petBounds.y + petBounds.height + 10;
      asrTextWin.setPosition(x, y);
    }
  }

  // ─── ASR Overlay Window ─────────────────────────────────────────────────────

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
        preload: path.join(__dirname, "..", "overlay-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    overlayWin.setAlwaysOnTop(true, "screen-saver");
    overlayWin.loadFile(path.join(__dirname, "..", "overlay-window.html"));

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
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send("hide");
    }
  }

  async function positionOverlayAtCaret() {
    const caretPos = await caretTracker.getCaretPosition();

    const posKey = caretPos ? `${caretPos.x},${caretPos.y},${caretPos.width},${caretPos.height}` : "null";
    if (posKey !== lastLoggedCaretPos) {
      lastLoggedCaretPos = posKey;
      console.log("[CaretTracker] getCaretPosition result:", caretPos);
    }

    if (caretPos && overlayWin && !overlayWin.isDestroyed()) {
      const logicalPos = screen.screenToDipPoint({ x: caretPos.x, y: caretPos.y + caretPos.height });
      const x = Math.round(logicalPos.x) + 5;
      const y = Math.round(logicalPos.y) + 5;
      overlayWin.setPosition(x, y);
    }
  }

  // ─── Popup Window ────────────────────────────────────────────────────────────

  function destroyPopup() {
    if (popupWin) {
      try {
        if (!popupWin.isDestroyed()) {
          popupWin.removeAllListeners("closed");
          popupWin.close();
        }
      } catch {}
      popupWin = null;
    }
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(false);
      win.webContents.send("popup-closed");
    }
  }

  function hidePopup() {
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.hide();
    }
  }

  function showPopup(petWinX, petWinY) {
    if (!popupWin || popupWin.isDestroyed()) {
      createPopup(petWinX, petWinY);
      return;
    }
    
    // Reposition popup
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

    popupWin.setPosition(posX, posY);
    popupWin.showInactive();
    popupWin.focus();
  }

  function createPopup(petWinX, petWinY) {
    // If popup already exists, show it instead of creating new one
    if (popupWin && !popupWin.isDestroyed()) {
      showPopup(petWinX, petWinY);
      return;
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
        preload: path.join(__dirname, "..", "preload.js"),
      },
    });

    popupWin.setAlwaysOnTop(true, "screen-saver");
    popupWin.loadFile(path.join(__dirname, "..", "popup.html"));

    popupWin.once("ready-to-show", () => {
      popupWin.show();
    });

    popupWin.on("blur", () => {
      setTimeout(() => {
        if (popupWin && !popupWin.isDestroyed() && !popupWin.isFocused()) {
          hidePopup();
        }
      }, 100);
    });

    popupWin.on("closed", () => {
      popupWin = null;
    });
  }

  // ─── Recording Window ────────────────────────────────────────────────────

  const RECORDING_W = 340;
  const RECORDING_H = 80; // 64px content + 8px shadow bleed on each side

  function createRecordingWindow() {
    if (recordingWin && !recordingWin.isDestroyed()) return;

    recordingWin = new BrowserWindow({
      width: RECORDING_W,
      height: RECORDING_H,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      show: false,
      focusable: false,
      type: "toolbar",
      webPreferences: {
        preload: path.join(__dirname, "..", "recording-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    recordingWin.setAlwaysOnTop(true, "floating");
    recordingWin.loadFile(path.join(__dirname, "..", "recording-window.html"));
    recordingWin.webContents.openDevTools({ mode: "detach" });

    recordingWin.on("closed", () => {
      recordingWin = null;
    });
  }

  function showRecordingWindow(petWinX, petWinY) {
    if (!recordingWin || recordingWin.isDestroyed()) {
      createRecordingWindow();
      recordingWin.once("ready-to-show", () => {
        _positionRecordingWindow(petWinX, petWinY);
        recordingWin.showInactive();
        const petWin = getWin();
        if (petWin && !petWin.isDestroyed()) petWin.moveTop();
      });
      return;
    }
    _positionRecordingWindow(petWinX, petWinY);
    recordingWin.showInactive();
    const petWin = getWin();
    if (petWin && !petWin.isDestroyed()) petWin.moveTop();
  }

  function _positionRecordingWindow(petWinX, petWinY) {
    if (!recordingWin || recordingWin.isDestroyed()) return;
    const x = petWinX + Math.round(WIN_WIDTH / 2) - RECORDING_W;
    const y = petWinY + Math.round((WIN_HEIGHT - RECORDING_H) / 2);
    recordingWin.setBounds({ x, y, width: RECORDING_W, height: RECORDING_H });
  }

  function syncRecordingWindowPosition() {
    const win = getWin();
    if (recordingWin && !recordingWin.isDestroyed() && recordingWin.isVisible()
        && win && !win.isDestroyed()) {
      const { x, y } = win.getBounds();
      _positionRecordingWindow(x, y);
    }
  }

  function hideRecordingWindow() {
    if (recordingWin && !recordingWin.isDestroyed()) {
      recordingWin.close();
    }
  }

  function getRecordingWin() {
    return recordingWin;
  }

  // ─── Settings Window ─────────────────────────────────────────────────────

  function createSettings() {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.focus();
      return;
    }

    const SETTINGS_W = 900;
    const SETTINGS_H = 540;

    // 基于屏幕居中，而非相对宠物
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const posX = workArea.x + Math.round((workArea.width - SETTINGS_W) / 2);
    const posY = workArea.y + Math.round((workArea.height - SETTINGS_H) / 2);

    settingsWin = new BrowserWindow({
      width: SETTINGS_W,
      height: SETTINGS_H,
      x: posX,
      y: posY,
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      resizable: false,
      skipTaskbar: false,
      hasShadow: true,
      show: false,
      focusable: true,
      title: "设置",
      webPreferences: {
        preload: path.join(__dirname, "..", "settings-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    settingsWin.loadFile(path.join(__dirname, "..", "settings-window.html"));

    settingsWin.once("ready-to-show", () => {
      settingsWin.show();
    });

    settingsWin.on("closed", () => {
      settingsWin = null;
    });
  }

  function destroySettings() {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.close();
      settingsWin = null;
    }
  }

  function getSettingsWin() {
    return settingsWin;
  }

  function getPopup() {
    return popupWin;
  }

  // ─── Task Window ─────────────────────────────────────────────────────

  const TASK_W = 420;
  const TASK_H = 520;

  function createTaskWindow() {
    if (taskWin && !taskWin.isDestroyed()) {
      taskWin.show();
      taskWin.focus();
      return;
    }

    // 基于屏幕居中
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const posX = workArea.x + Math.round((workArea.width - TASK_W) / 2);
    const posY = workArea.y + Math.round((workArea.height - TASK_H) / 2);

    taskWin = new BrowserWindow({
      width: TASK_W,
      height: TASK_H,
      x: posX,
      y: posY,
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      resizable: true,
      skipTaskbar: false,
      hasShadow: true,
      show: false,
      focusable: true,
      title: "任务列表",
      webPreferences: {
        preload: path.join(__dirname, "..", "task-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    taskWin.loadFile(path.join(__dirname, "..", "task-window.html"));

    taskWin.once("ready-to-show", () => {
      taskWin.show();
    });

    taskWin.on("closed", () => {
      taskWin = null;
    });
  }

  function showTaskWindow() {
    if (!taskWin || taskWin.isDestroyed()) {
      createTaskWindow();
      return;
    }
    taskWin.show();
    taskWin.focus();
  }

  function hideTaskWindow() {
    if (taskWin && !taskWin.isDestroyed()) {
      taskWin.hide();
    }
  }

  function destroyTaskWindow() {
    if (taskWin && !taskWin.isDestroyed()) {
      taskWin.close();
      taskWin = null;
    }
  }

  function getTaskWin() {
    return taskWin;
  }

  // ─── Expert Review Window ─────────────────────────────────────────────────────

  const EXPERT_REVIEW_W = 600;
  const EXPERT_REVIEW_H = 700;

  function createExpertReviewWindow(reviewData) {
    if (expertReviewWin && !expertReviewWin.isDestroyed()) {
      expertReviewWin.webContents.send('expert-review:data', reviewData);
      expertReviewWin.show();
      expertReviewWin.focus();
      return new Promise((resolve, reject) => {
        resolve(expertReviewWin);
      });
    }

    // 基于屏幕居中
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    const posX = workArea.x + Math.round((workArea.width - EXPERT_REVIEW_W) / 2);
    const posY = workArea.y + Math.round((workArea.height - EXPERT_REVIEW_H) / 2);

    expertReviewWin = new BrowserWindow({
      width: EXPERT_REVIEW_W,
      height: EXPERT_REVIEW_H,
      x: posX,
      y: posY,
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      resizable: true,
      skipTaskbar: false,
      hasShadow: true,
      show: false,
      focusable: true,
      title: "专家审核",
      webPreferences: {
        preload: path.join(__dirname, "..", "expert-review-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    expertReviewWin.loadFile(path.join(__dirname, "..", "expert-review-window.html"));

    // 创建一个 Promise 用于等待审核完成
    const reviewPromise = new Promise((resolve, reject) => {
      expertReviewResolver = resolve;
      expertReviewRejector = reject;
    });

    expertReviewWin.once("ready-to-show", () => {
      // 发送审核数据
      expertReviewWin.webContents.send('expert-review:data', reviewData);
      expertReviewWin.show();
    });

    expertReviewWin.on("closed", () => {
      // 如果窗口被意外关闭，reject Promise
      if (expertReviewRejector) {
        expertReviewRejector(new Error('审核窗口已关闭'));
        expertReviewResolver = null;
        expertReviewRejector = null;
      }
      expertReviewWin = null;
    });

    // 阻止窗口关闭，改为最小化
    expertReviewWin.on("close", (e) => {
      if (expertReviewWin && !expertReviewWin.isDestroyed()) {
        e.preventDefault();
        expertReviewWin.minimize();
      }
    });

    return reviewPromise;
  }

  function showExpertReviewWindow(reviewData) {
    return createExpertReviewWindow(reviewData);
  }

  function completeExpertReview(reviewData) {
    if (expertReviewResolver) {
      expertReviewResolver(reviewData);
      expertReviewResolver = null;
      expertReviewRejector = null;
    }
    destroyExpertReviewWindow();
  }

  function hideExpertReviewWindow() {
    if (expertReviewWin && !expertReviewWin.isDestroyed()) {
      expertReviewWin.hide();
    }
  }

  function destroyExpertReviewWindow() {
    if (expertReviewWin && !expertReviewWin.isDestroyed()) {
      // 移除 close 事件监听器，允许真正关闭
      expertReviewWin.removeAllListeners('close');
      expertReviewWin.destroy();
      expertReviewWin = null;
    }
  }

  function getExpertReviewWin() {
    return expertReviewWin;
  }

  return {
    clampToScreen,
    createAsrTextWindow,
    destroyAsrTextWindow,
    updateAsrText,
    flashAsrTextInjected,
    syncAsrTextWindowPosition,
    createOverlayWindow,
    destroyOverlayWindow,
    updateOverlayText,
    showFinalText,
    hideOverlayWindow,
    positionOverlayAtCaret,
    createPopup,
    destroyPopup,
    hidePopup,
    showPopup,
    getPopup,
    createRecordingWindow,
    showRecordingWindow,
    hideRecordingWindow,
    syncRecordingWindowPosition,
    getRecordingWin,
    createSettings,
    destroySettings,
    getSettingsWin,
    createTaskWindow,
    showTaskWindow,
    hideTaskWindow,
    destroyTaskWindow,
    getTaskWin,
    createExpertReviewWindow,
    showExpertReviewWindow,
    hideExpertReviewWindow,
    destroyExpertReviewWindow,
    completeExpertReview,
    getExpertReviewWin,
  };
}

module.exports = { createWindowManager };
