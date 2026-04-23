const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskAPI', {
  // 接收任务更新
  onTaskUpdate: (callback) => {
    ipcRenderer.on('task:update', (_event, taskData) => callback(taskData));
  },
  // 接收任务列表更新
  onTaskListUpdate: (callback) => {
    ipcRenderer.on('task:list-update', (_event, taskList) => callback(taskList));
  },
  // 请求初始任务列表
  requestTaskList: () => {
    ipcRenderer.send('task:request-list');
  },
  // 关闭窗口
  closeWindow: () => {
    ipcRenderer.send('task-window:close');
  },
  // 最小化窗口
  minimizeWindow: () => {
    ipcRenderer.send('task-window:minimize');
  },
});
