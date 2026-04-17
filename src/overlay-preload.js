const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayAPI", {
  onUpdateText: (cb) => ipcRenderer.on("update-text", (_event, text) => cb(text)),
  onShowFinal: (cb) => ipcRenderer.on("show-final", (_event, text) => cb(text)),
  onHide: (cb) => ipcRenderer.on("hide", () => cb()),
});
