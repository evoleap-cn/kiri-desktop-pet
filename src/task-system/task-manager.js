/**
 * TaskManager - 全局任务管理器
 * 
 * 管理所有任务队列的单例，提供任务创建、查询和状态广播功能。
 * 通过 IPC 向渲染进程广播任务状态变更。
 */

const { TaskQueue } = require('./task-queue');
const { RecordingSummaryTask } = require('./recording-summary-task');

let instance = null;

function createTaskManager({ mainWindowGetter, windowManager }) {
  if (instance) return instance;

  const mainQueue = new TaskQueue();
  const taskHistory = []; // 已完成的任务历史

  // 监听任务完成，移入历史
  mainQueue.onTaskCompleted((taskData) => {
    taskHistory.push(taskData);
    // 只保留最近 50 条历史
    if (taskHistory.length > 50) taskHistory.shift();
  });

  /**
   * 通知所有渲染进程任务状态更新
   */
  function broadcastTaskUpdate(taskData) {
    const channels = [
      { getter: mainWindowGetter, name: 'main' },
      { getter: () => windowManager?.getTaskWin?.(), name: 'task' },
    ];

    for (const { getter } of channels) {
      try {
        const win = getter?.();
        if (win && !win.isDestroyed()) {
          win.webContents.send('task:update', taskData);
        }
      } catch {}
    }
  }

  /**
   * 通知所有渲染进程任务列表更新
   */
  function broadcastTaskListUpdate() {
    const taskList = mainQueue.getTaskList();
    const channels = [
      { getter: mainWindowGetter, name: 'main' },
      { getter: () => windowManager?.getTaskWin?.(), name: 'task' },
    ];

    for (const { getter } of channels) {
      try {
        const win = getter?.();
        if (win && !win.isDestroyed()) {
          win.webContents.send('task:list-update', taskList);
        }
      } catch {}
    }
  }

  // 注册队列事件监听
  mainQueue.onTaskUpdate((taskData) => {
    broadcastTaskUpdate(taskData);
    broadcastTaskListUpdate();
  });

  mainQueue.onTaskAdded((taskData) => {
    broadcastTaskListUpdate();
  });

  mainQueue.onTaskStarted((taskData) => {
    broadcastTaskUpdate(taskData);
    broadcastTaskListUpdate();
  });

  /**
   * 创建录音纪要任务并加入队列
   * @param {string} audioPath - 音频文件路径
   * @param {object} options - 任务选项
   * @returns {RecordingSummaryTask}
   */
  function createRecordingSummaryTask(audioPath, options = {}) {
    // 将 windowManager 添加到 options 中
    const taskOptions = {
      ...options,
      windowManager: windowManager
    };
    
    const task = new RecordingSummaryTask(audioPath, taskOptions);
    mainQueue.append(task);
    return task;
  }

  /**
   * 获取主队列
   * @returns {TaskQueue}
   */
  function getQueue() {
    return mainQueue;
  }

  /**
   * 获取任务列表（含历史）
   * @returns {Array}
   */
  function getTaskList() {
    return mainQueue.getTaskList();
  }

  /**
   * 获取当前执行中的任务
   * @returns {object|null}
   */
  function getCurrentTask() {
    const task = mainQueue.getCurrentTask();
    return task ? task.toJSON() : null;
  }

  /**
   * 手动触发队列处理
   */
  function processNext() {
    mainQueue.processNext();
  }

  // 保存实例引用
  instance = {
    createRecordingSummaryTask,
    getQueue,
    getTaskList,
    getCurrentTask,
    processNext,
    // 暴露队列的事件监听
    onTaskUpdate: (cb) => mainQueue.onTaskUpdate(cb),
    onTaskAdded: (cb) => mainQueue.onTaskAdded(cb),
    onTaskStarted: (cb) => mainQueue.onTaskStarted(cb),
    onTaskCompleted: (cb) => mainQueue.onTaskCompleted(cb),
  };

  return instance;
}

// 导出获取实例的方法
function getTaskManager() {
  return instance;
}

module.exports = { createTaskManager, getTaskManager };
