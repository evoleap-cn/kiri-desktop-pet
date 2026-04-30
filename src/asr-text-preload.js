const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("asrTextAPI", {
  onUpdateText: (cb) => ipcRenderer.on("update-asr-text", (_event, text) => cb(text)),
  onFlashInjected: (cb) => ipcRenderer.on("flash-asr-text-injected", () => cb()),
});
