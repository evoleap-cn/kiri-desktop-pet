/**
 * Task 基类 - 任务的抽象接口
 * 
 * 每个任务包含多个阶段，支持进度追踪和状态管理。
 * 总进度 = Σ(已完成阶段权重) + 当前阶段进度 × 当前阶段权重
 */

const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  FAILED: 'failed',
  COMPLETED: 'completed',
};

const STAGE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

let globalTaskId = 0;

class Task {
  constructor(name) {
    this.id = `task-${++globalTaskId}`;
    this.name = name;
    this.status = TASK_STATUS.PENDING;
    this.stages = [];
    this.currentStageIndex = -1;
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
    this._listeners = [];
  }

  /**
   * 添加阶段
   * @param {string} name - 阶段名称
   * @param {number} weight - 权重百分比 (0-100)
   * @returns {Task} this
   */
  addStage(name, weight) {
    this.stages.push({
      name,
      weight,
      status: STAGE_STATUS.PENDING,
      progress: 0,
      error: null,
    });
    return this;
  }

  /**
   * 开始任务
   */
  start() {
    if (this.status !== TASK_STATUS.PENDING) return;
    this.status = TASK_STATUS.RUNNING;
    this.startedAt = new Date();
    this._moveToNextStage();
    this._notify();
  }

  /**
   * 更新当前阶段的进度
   * @param {number} progress - 0-100
   */
  updateProgress(progress) {
    if (this.status !== TASK_STATUS.RUNNING) return;
    const stage = this.stages[this.currentStageIndex];
    if (!stage) return;
    stage.progress = Math.min(100, Math.max(0, progress));
    this._notify();
  }

  /**
   * 完成当前阶段并进入下一阶段
   */
  completeStage() {
    if (this.status !== TASK_STATUS.RUNNING) return;
    const stage = this.stages[this.currentStageIndex];
    if (!stage) return;

    stage.status = STAGE_STATUS.COMPLETED;
    stage.progress = 100;

    this._moveToNextStage();
    this._notify();
  }

  /**
   * 标记当前阶段失败
   * @param {string} error - 错误信息
   */
  failStage(error) {
    if (this.status !== TASK_STATUS.RUNNING) return;
    const stage = this.stages[this.currentStageIndex];
    if (!stage) return;

    stage.status = STAGE_STATUS.FAILED;
    stage.error = error;
    this.status = TASK_STATUS.FAILED;
    this.error = error;
    this.completedAt = new Date();
    this._notify();
  }

  /**
   * 跳过当前阶段
   */
  skipStage() {
    if (this.status !== TASK_STATUS.RUNNING) return;
    const stage = this.stages[this.currentStageIndex];
    if (!stage) return;

    stage.status = STAGE_STATUS.SKIPPED;
    stage.progress = 100;

    this._moveToNextStage();
    this._notify();
  }

  /**
   * 获取总进度百分比 (0-100)
   */
  getTotalProgress() {
    let progress = 0;
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      if (stage.status === STAGE_STATUS.COMPLETED || stage.status === STAGE_STATUS.SKIPPED) {
        progress += stage.weight;
      } else if (i === this.currentStageIndex && stage.status === STAGE_STATUS.RUNNING) {
        progress += (stage.progress / 100) * stage.weight;
      }
    }
    return Math.min(100, Math.round(progress));
  }

  /**
   * 获取当前阶段名称
   */
  getCurrentStageName() {
    if (this.currentStageIndex < 0 || this.currentStageIndex >= this.stages.length) {
      return null;
    }
    return this.stages[this.currentStageIndex].name;
  }

  /**
   * 注册状态变化监听
   */
  onUpdate(callback) {
    this._listeners.push(callback);
    return () => {
      const idx = this._listeners.indexOf(callback);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  /**
   * 序列化任务状态用于 IPC 传输
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      stages: this.stages,
      currentStageIndex: this.currentStageIndex,
      totalProgress: this.getTotalProgress(),
      currentStageName: this.getCurrentStageName(),
      createdAt: this.createdAt.toISOString(),
      startedAt: this.startedAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      error: this.error,
    };
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  _moveToNextStage() {
    this.currentStageIndex++;
    if (this.currentStageIndex >= this.stages.length) {
      // 所有阶段完成
      this.status = TASK_STATUS.COMPLETED;
      this.completedAt = new Date();
      return;
    }
    this.stages[this.currentStageIndex].status = STAGE_STATUS.RUNNING;
  }

  _notify() {
    const data = this.toJSON();
    this._listeners.forEach(cb => {
      try { cb(data); } catch (err) { console.error('[Task] Listener error:', err); }
    });
  }
}

module.exports = { Task, TASK_STATUS, STAGE_STATUS };
