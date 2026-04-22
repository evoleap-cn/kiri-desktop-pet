const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('acpAPI', {
  // 消息
  sendMessage: (data) => ipcRenderer.invoke('acp:send-message', data),

  // 会话管理
  listSessions: () => ipcRenderer.invoke('acp:list-sessions'),
  newSession: (opts) => ipcRenderer.invoke('acp:new-session', opts),
  deleteSession: (sessionId) => ipcRenderer.invoke('acp:delete-session', sessionId),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('acp:minimize'),
  maximizeWindow: () => ipcRenderer.send('acp:maximize'),
  closeWindow: () => ipcRenderer.send('acp:close'),

  // 存储 API (mock)
  storeGet: async (name, key) => {
    const stored = localStorage.getItem(`${name}:${key}`)
    return stored
  },
  storeSet: async (name, key, value) => {
    localStorage.setItem(`${name}:${key}`, value)
  },
  storeDelete: async (name, key) => {
    localStorage.removeItem(`${name}:${key}`)
  },
  storeClear: async (name) => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(`${name}:`))
    keys.forEach(k => localStorage.removeItem(k))
  },
  storeKeys: async (name) => {
    return Object.keys(localStorage).filter(k => k.startsWith(`${name}:`)).map(k => k.slice(name.length + 1))
  },
  storeLength: async (name) => {
    return Object.keys(localStorage).filter(k => k.startsWith(`${name}:`)).length
  },
})

// 全局类型声明
window.acpAPI = window.acpAPI
