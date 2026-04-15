const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window management
  moveWindowBy: (dx, dy) => ipcRenderer.send("move-window-by", dx, dy),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragEnd: () => ipcRenderer.send("drag-end"),
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", ignore),
  openMenu: () => ipcRenderer.send("open-menu"),
  closeMenu: () => ipcRenderer.send("close-menu"),
  menuAction: (action) => ipcRenderer.send("menu-action", action),
  openContextMenu: (screenX, screenY) => ipcRenderer.send("open-context-menu", screenX, screenY),
  onPopupClosed: (cb) => ipcRenderer.on("popup-closed", cb),

  // ASR
  onAsrPartial: (cb) => ipcRenderer.on("asr:partial-result", (_event, text) => cb(text)),
  onAsrFinal: (cb) => ipcRenderer.on("asr:final-result", (_event, text) => cb(text)),
  onAsrError: (cb) => ipcRenderer.on("asr:error", (_event, msg) => cb(msg)),
  onAsrRecordingStarted: (cb) => ipcRenderer.on("asr:recording-started", () => cb()),
  onAsrRecordingStopped: (cb) => ipcRenderer.on("asr:recording-stopped", () => cb()),
  onAsrTextInjected: (cb) => ipcRenderer.on("asr:text-injected", (_event, text) => cb(text)),
  onAsrStatus: (cb) => ipcRenderer.on("asr:status", (_event, msg) => cb(msg)),
  onAsrServerReady: (cb) => ipcRenderer.on("asr:server-ready", () => cb()),
  getAsrStatus: () => ipcRenderer.invoke("asr:status-request"),
  // Debug: forward renderer logs to main process
  _log: (msg) => ipcRenderer.send("renderer-log", msg),
});
