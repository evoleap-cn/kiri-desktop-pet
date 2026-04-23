const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recordingAPI", {
  onRecordingStarted: (cb) => ipcRenderer.on("summary:recording-started", () => cb()),
  onRecordingStopped: (cb) => ipcRenderer.on("summary:recording-stopped", () => cb()),
  stopRecording: () => ipcRenderer.send("recording:stop"),
  sendAudioChunk: (buffer) => ipcRenderer.send("recording:audio-chunk", buffer),
});
