const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('acpAPI', {
  // 消息发送
  sendMessage: (data) => ipcRenderer.invoke('acp:send-message', data),

  // 会话管理
  listSessions: () => ipcRenderer.invoke('acp:list-sessions'),
  newSession: (opts) => ipcRenderer.invoke('acp:new-session', opts),
  deleteSession: (sessionId) => ipcRenderer.invoke('acp:delete-session', sessionId),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('acp:minimize'),
  maximizeWindow: () => ipcRenderer.send('acp:maximize'),
  closeWindow: () => ipcRenderer.send('acp:close'),
})
