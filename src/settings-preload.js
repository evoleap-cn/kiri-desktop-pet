const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsAPI", {
  // 加载设置
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  
  // 保存设置
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  
  // 测试 ASR 连接
  testAsrConnection: (serverUrl) => ipcRenderer.invoke("asr:test-connection", serverUrl),
  
  // 更新热键
  updateHotkey: (newHotkey) => ipcRenderer.invoke("hotkey:update", newHotkey),
  
  // 导出偏好设置
  exportPrefs: () => ipcRenderer.invoke("prefs:export"),
  
  // 导入偏好设置
  importPrefs: () => ipcRenderer.invoke("prefs:import"),
  
  // 重置窗口位置
  resetPosition: () => ipcRenderer.invoke("position:reset"),
  
  // 设置开机自启
  setAutoLaunch: (enable) => ipcRenderer.invoke("autostart:set", enable),
  
  // 最小化窗口
  minimize: () => ipcRenderer.send("settings:minimize"),
  
  // 监听窗口关闭
  onClose: (callback) => {
    ipcRenderer.on("settings:close", callback);
  },
});
