/**
 * RecordingSummaryTask - 录音纪要任务
 * 
 * 录音完成后自动触发的 AI 处理任务，包含多个阶段：
 * 1. 启动AI感知引擎 (10%)
 * 2. 加载录音数据 (15%)
 * 3. Kiri正在听写... (35%)
 * 4. Kiri正在为逐字稿脱敏 (15%) - 暂时跳过
 * 5. Kiri正在总结内容 (25%) - 暂时跳过
 */

const { Task, TASK_STATUS, STAGE_STATUS } = require('./task');
const { WhisperXClient } = require('./whisperx-client');

class RecordingSummaryTask extends Task {
  /**
   * @param {string} audioPath - 录音文件路径
   * @param {object} options - 可选配置
   */
  constructor(audioPath, options = {}) {
    super('录音纪要');

    this.audioPath = audioPath;
    this.outputPaths = options.outputPaths || {};
    this.whisperXClient = options.whisperXClient || new WhisperXClient(options.whisperX || {});
    this.result = null; // 存储最终结果

    // 定义任务阶段
    this.addStage('启动AI感知引擎', 10);    // 阶段0
    this.addStage('加载录音数据', 15);       // 阶段1
    this.addStage('Kiri正在听写...', 35);    // 阶段2
    this.addStage('Kiri正在为逐字稿脱敏', 15); // 阶段3 - 暂时跳过
    this.addStage('Kiri正在总结内容', 25);    // 阶段4 - 暂时跳过
  }

  /**
   * 重写 start 方法，执行实际的任务逻辑
   */
  start() {
    super.start();
    this._execute().catch(err => {
      console.error('[RecordingSummaryTask] Execution error:', err);
      this.failStage(err.message);
    });
  }

  /**
   * 执行任务的主要逻辑
   */
  async _execute() {
    try {
      // 阶段0: 启动AI感知引擎
      await this._loadAIEngine();

      // 阶段1: 加载录音数据
      await this._loadAudioData();

      // 阶段2: 听写（流式转录）
      await this._transcribe();

      // 阶段3: 脱敏（暂时跳过）
      this.skipStage();

      // 阶段4: 总结（暂时跳过）
      this.skipStage();

    } catch (err) {
      // 如果当前阶段还没标记失败，则标记
      const stage = this.stages[this.currentStageIndex];
      if (stage && stage.status === STAGE_STATUS.RUNNING) {
        this.failStage(err.message);
      }
    }
  }

  /**
   * 阶段0: 启动AI感知引擎
   * 加载 WhisperX 转录模型和说话人分离模型
   */
  async _loadAIEngine() {
    try {
      // 更新进度模拟加载过程
      const progressInterval = setInterval(() => {
        const currentProgress = this.stages[0].progress;
        if (currentProgress < 90) {
          this.updateProgress(currentProgress + 10);
        }
      }, 200);

      // 加载转录模型
      await this.whisperXClient.loadTranscriptionModel();
      this.updateProgress(50);

      // 加载说话人分离模型
      await this.whisperXClient.loadDiarizationModel();
      this.updateProgress(90);

      clearInterval(progressInterval);
      this.updateProgress(100);
      this.completeStage();

    } catch (err) {
      throw new Error(`AI引擎启动失败: ${err.message}`);
    }
  }

  /**
   * 阶段1: 加载录音数据
   * 验证音频文件并准备上传
   */
  async _loadAudioData() {
    try {
      // 验证音频文件存在
      const fs = require('fs');
      if (!fs.existsSync(this.audioPath)) {
        throw new Error(`音频文件不存在: ${this.audioPath}`);
      }

      // 模拟加载进度
      this.updateProgress(30);
      await this._delay(200);

      this.updateProgress(60);
      await this._delay(200);

      this.updateProgress(100);
      this.completeStage();

    } catch (err) {
      throw new Error(`录音数据加载失败: ${err.message}`);
    }
  }

  /**
   * 阶段2: 听写（流式转录）
   * 调用 WhisperX 流式转录接口，实时获取识别结果
   */
  async _transcribe() {
    try {
      const allSegments = [];

      await this.whisperXClient.transcribeStream(this.audioPath, {
        onSegment: (segment) => {
          allSegments.push(segment);
          // 流式输出片段时可以通知 UI
          const speaker = segment.speaker || '未知';
          const text = segment.text || '';
          console.log(`[RecordingSummaryTask] [${segment.start?.toFixed(1)}s - ${segment.end?.toFixed(1)}s] ${speaker}: ${text}`);
        },
        onProgress: (progress) => {
          // 将转录进度映射到当前阶段的进度
          this.updateProgress(progress);
        },
      });

      // 合并相邻相同 speaker 的文本
      const mergedSegments = this._mergeConsecutiveSpeakers(allSegments);

      // 保存 JSON 和 Markdown 文件
      this.result = {
        audioPath: this.audioPath,
        segments: allSegments,
        mergedSegments: mergedSegments,
        createdAt: new Date().toISOString(),
      };

      this._saveTranscriptionResults(mergedSegments);

      this.updateProgress(100);
      this.completeStage();

    } catch (err) {
      throw new Error(`听写失败: ${err.message}`);
    }
  }

  /**
   * 合并相邻相同 speaker 的文本
   * @param {Array} segments - 原始片段数组
   * @returns {Array} 合并后的片段数组
   */
  _mergeConsecutiveSpeakers(segments) {
    if (!segments || segments.length === 0) return [];

    const merged = [];
    let current = { ...segments[0] };

    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      if (next.speaker === current.speaker) {
        // 相同 speaker，合并文本
        current.text = (current.text || '') + (next.text || '');
        current.end = next.end; // 更新时间戳
        if (next.words) {
          current.words = (current.words || []).concat(next.words);
        }
      } else {
        // 不同 speaker，保存当前并开始新的
        merged.push(current);
        current = { ...next };
      }
    }
    // 添加最后一个片段
    merged.push(current);

    return merged;
  }

  /**
   * 保存转录结果（JSON 和 Markdown）
   * @param {Array} mergedSegments - 合并后的片段
   */
  _saveTranscriptionResults(mergedSegments) {
    const fs = require('fs');
    const path = require('path');

    // 生成文件名（基于音频文件名）
    const audioBaseName = path.basename(this.audioPath, path.extname(this.audioPath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${audioBaseName}_${timestamp}`;

    // 获取输出路径
    const jsonPath = this.outputPaths.json || require('electron').app.getPath('documents');
    const markdownPath = this.outputPaths.markdown || require('electron').app.getPath('documents');

    // 确保目录存在
    if (!fs.existsSync(jsonPath)) fs.mkdirSync(jsonPath, { recursive: true });
    if (!fs.existsSync(markdownPath)) fs.mkdirSync(markdownPath, { recursive: true });

    // 保存 JSON
    const jsonFilePath = path.join(jsonPath, `${fileName}.json`);
    const jsonData = {
      audioPath: this.audioPath,
      createdAt: new Date().toISOString(),
      segments: mergedSegments.map(s => ({
        speaker: s.speaker,
        text: s.text,
        start: s.start,
        end: s.end,
      })),
    };
    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
    console.log(`[RecordingSummaryTask] Saved JSON to: ${jsonFilePath}`);

    // 保存 Markdown
    const mdFilePath = path.join(markdownPath, `${fileName}.md`);
    const markdownContent = this._generateMarkdown(mergedSegments);
    fs.writeFileSync(mdFilePath, markdownContent);
    console.log(`[RecordingSummaryTask] Saved Markdown to: ${mdFilePath}`);
  }

  /**
   * 生成 Markdown 格式
   * @param {Array} mergedSegments - 合并后的片段
   * @returns {string} Markdown 内容
   */
  _generateMarkdown(mergedSegments) {
    const lines = [];

    // 标题
    const audioName = require('path').basename(this.audioPath, require('path').extname(this.audioPath));
    lines.push(`# 录音纪要`);
    lines.push('');
    lines.push(`**录音文件**: ${audioName}`);
    lines.push(`**生成时间**: ${new Date().toLocaleString('zh-CN')}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // 逐字稿
    lines.push('## 逐字稿');
    lines.push('');

    for (const segment of mergedSegments) {
      const speaker = segment.speaker || '未知';
      const text = segment.text || '';
      const timeStr = segment.start != null ? ` [${segment.start.toFixed(1)}s - ${segment.end?.toFixed(1) || '?'}s]` : '';
      lines.push(`**${speaker}**${timeStr}: ${text}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 延迟工具函数
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { RecordingSummaryTask };
