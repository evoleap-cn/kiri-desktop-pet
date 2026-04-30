/**
 * TaskQueue - 任务队列管理器
 * 
 * 管理多个任务的排队和执行，支持自动处理下一个任务。
 */

const { TASK_STATUS } = require('./task');

class TaskQueue {
  constructor() {
    this.tasks = [];
    this.isProcessing = false;
    this._onTaskAddedListeners = [];
    this._onTaskStartedListeners = [];
    this._onTaskCompletedListeners = [];
    this._onTaskUpdateListeners = [];
  }

  /**
   * 添加任务到队列
   * @param {Task} task 
   */
  append(task) {
    this.tasks.push(task);
    task.onUpdate((taskData) => {
      this._notifyTaskUpdate(taskData);
      // 检查任务是否完成
      if (taskData.status === TASK_STATUS.COMPLETED || taskData.status === TASK_STATUS.FAILED) {
        this._notifyTaskCompleted(taskData);
        // 自动处理下一个任务
        this.processNext();
      }
    });
    this._notifyTaskAdded(task);
  }

  /**
   * 获取下一个待执行任务
   * @returns {Task|null}
   */
  getNextTask() {
    return this.tasks.find(t => t.status === TASK_STATUS.PENDING) || null;
  }

  /**
   * 执行下一个任务
   */
  processNext() {
    if (this.isProcessing) return;
    const task = this.getNextTask();
    if (!task) return;

    this.isProcessing = true;
    this._notifyTaskStarted(task);
    task.start();
  }

  /**
   * 获取所有任务列表（序列化）
   * @returns {Array}
   */
  getTaskList() {
    return this.tasks.map(t => t.toJSON()).reverse(); // 最新的在前面
  }

  /**
   * 获取正在执行的任务
   * @returns {Task|null}
   */
  getCurrentTask() {
    return this.tasks.find(t => t.status === TASK_STATUS.RUNNING) || null;
  }

  /**
   * 获取待处理任务数量
   * @returns {number}
   */
  getPendingCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.PENDING).length;
  }

  // ─── Event Listeners ───────────────────────────────────────────────────

  onTaskAdded(callback) {
    this._onTaskAddedListeners.push(callback);
    return () => {
      const idx = this._onTaskAddedListeners.indexOf(callback);
      if (idx !== -1) this._onTaskAddedListeners.splice(idx, 1);
    };
  }

  onTaskStarted(callback) {
    this._onTaskStartedListeners.push(callback);
    return () => {
      const idx = this._onTaskStartedListeners.indexOf(callback);
      if (idx !== -1) this._onTaskStartedListeners.splice(idx, 1);
    };
  }

  onTaskCompleted(callback) {
    this._onTaskCompletedListeners.push(callback);
    return () => {
      const idx = this._onTaskCompletedListeners.indexOf(callback);
      if (idx !== -1) this._onTaskCompletedListeners.splice(idx, 1);
    };
  }

  onTaskUpdate(callback) {
    this._onTaskUpdateListeners.push(callback);
    return () => {
      const idx = this._onTaskUpdateListeners.indexOf(callback);
      if (idx !== -1) this._onTaskUpdateListeners.splice(idx, 1);
    };
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  _notifyTaskAdded(task) {
    const data = task.toJSON();
    this._onTaskAddedListeners.forEach(cb => {
      try { cb(data); } catch (err) { console.error('[TaskQueue] onTaskAdded error:', err); }
    });
  }

  _notifyTaskStarted(task) {
    const data = task.toJSON();
    this._onTaskStartedListeners.forEach(cb => {
      try { cb(data); } catch (err) { console.error('[TaskQueue] onTaskStarted error:', err); }
    });
  }

  _notifyTaskCompleted(taskData) {
    this.isProcessing = false;
    this._onTaskCompletedListeners.forEach(cb => {
      try { cb(taskData); } catch (err) { console.error('[TaskQueue] onTaskCompleted error:', err); }
    });
  }

  _notifyTaskUpdate(taskData) {
    this._onTaskUpdateListeners.forEach(cb => {
      try { cb(taskData); } catch (err) { console.error('[TaskQueue] onTaskUpdate error:', err); }
    });
  }
}

module.exports = { TaskQueue };
