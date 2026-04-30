/**
 * RecordingSummaryTask - 录音纪要任务
 *
 * 录音完成后自动触发的 AI 处理任务，包含多个阶段：
 * 1. 连接ASR引擎 (10%)
 * 2. 加载录音数据 (10%)
 * 3. Kiri正在听写... (20%)
 * 4. Kiri正在为逐字稿脱敏 (15%)
 * 5. Kiri正在检查错别字 (20%)
 * 6. 等待专家审核结果 (15%)
 * 7. 正在上传 (10%)
 */

const { Task, TASK_STATUS, STAGE_STATUS } = require('./task');
const { ISIAsrClient } = require('./isi-asr-client');
const { DesensitizerClient } = require('./desensitizer-client');

class RecordingSummaryTask extends Task {
  /**
   * @param {string} audioPath - 录音文件路径
   * @param {object} options - 可选配置
   */
  constructor(audioPath, options = {}) {
    super('录音纪要');

    this.audioPath = audioPath;
    this.outputPaths = options.outputPaths || {};
    this.isiClient = options.isiClient || new ISIAsrClient(options.isi || {});
    this.desensitizerClient = new DesensitizerClient(options.desensitizerUrl || 'http://localhost:8080');
    this.options = options; // 保存 options 以便后续使用
    this.result = null; // 存储最终结果
    this.expertReviewResult = null; // 存储专家审核结果

    // 定义任务阶段
    this.addStage('连接ASR引擎', 10);           // 阶段0
    this.addStage('加载录音数据', 10);          // 阶段1
    this.addStage('Kiri正在听写...', 20);       // 阶段2
    this.addStage('Kiri正在为逐字稿脱敏', 15);  // 阶段3
    this.addStage('Kiri正在检查错别字', 20);    // 阶段4
    this.addStage('等待专家审核结果', 15);      // 阶段5
    this.addStage('正在上传', 10);              // 阶段6
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

      // 阶段3: 脱敏
      await this._desensitize();

      // 阶段4: 检查错别字
      await this._checkTypos();

      // 阶段5: 等待专家审核
      await this._waitForExpertReview(this.options?.windowManager);

      // 阶段6: 上传
      await this._upload();

    } catch (err) {
      // 如果当前阶段还没标记失败，则标记
      const stage = this.stages[this.currentStageIndex];
      if (stage && stage.status === STAGE_STATUS.RUNNING) {
        this.failStage(err.message);
      }
    }
  }

  /**
   * 阶段0: 连接ASR引擎
   * REST API 无需显式连接，直接跳过
   */
  async _loadAIEngine() {
    // REST API 无需模型加载或连接验证，直接完成
    this.updateProgress(100);
    this.completeStage();
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
   * 调用 ISI ASR WebSocket 接口，实时获取识别结果
   */
  async _transcribe() {
    try {
      const allSegments = [];

      await this.isiClient.transcribe(this.audioPath, {
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

      // 保存结果到内存（不保存到文件）
      this.result = {
        audioPath: this.audioPath,
        segments: allSegments,
        mergedSegments: mergedSegments,
        createdAt: new Date().toISOString(),
      };

      // 阶段2完成后，弹出逐字稿（用默认应用打开 MD 文件）
      this._openTranscriptForDoctor();

      this.updateProgress(100);
      this.completeStage();

    } catch (err) {
      throw new Error(`听写失败: ${err.message}`);
    }
  }

  /**
   * 美化说话人标签
   * @param {string} speaker - 原始说话人 ID（如 spk_0, spk_1）
   * @returns {string} 美化后的标签（如 说话人A, 说话人B）
   */
  _beautifySpeaker(speaker) {
    if (!speaker) return '未知';
    const match = speaker.match(/spk_(\d+)/);
    if (match) {
      const index = parseInt(match[1], 10);
      // 0 → A, 1 → B, 2 → C...
      const letter = String.fromCharCode(65 + index);
      return `说话人${letter}`;
    }
    return speaker;
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

    // 美化说话人标签
    return merged.map(s => ({
      ...s,
      speaker: this._beautifySpeaker(s.speaker),
    }));
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
   * 弹出逐字稿（用默认应用打开 MD 文件）
   * 给医生展示转录结果
   */
  _openTranscriptForDoctor() {
    const { shell } = require('electron');
    const path = require('path');

    // 获取 MD 文件路径（与 _saveTranscriptionResults 中的逻辑一致）
    const audioBaseName = path.basename(this.audioPath, path.extname(this.audioPath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${audioBaseName}_${timestamp}`;
    const markdownPath = this.outputPaths.markdown || require('electron').app.getPath('documents');
    const mdFilePath = path.join(markdownPath, `${fileName}.md`);

    console.log(`[RecordingSummaryTask] Opening transcript for doctor: ${mdFilePath}`);

    try {
      shell.openPath(mdFilePath);
    } catch (err) {
      console.error('[RecordingSummaryTask] Failed to open transcript:', err);
    }
  }

  /**
   * 延迟工具函数
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 阶段3: 脱敏处理
   * 对逐字稿中的敏感信息进行脱敏处理
   */
  async _desensitize() {
    try {
      if (!this.result || !this.result.mergedSegments || this.result.mergedSegments.length === 0) {
        throw new Error('没有可脱敏的转录数据');
      }

      this.updateProgress(10);
      console.log('[RecordingSummaryTask] 开始脱敏处理...');
      console.log(`[RecordingSummaryTask] 共有 ${this.result.mergedSegments.length} 个片段`);

      // 使用批量脱敏：将所有片段合并成一次请求
      const response = await this.desensitizerClient.desensitizeSegments(
        this.result.mergedSegments,
        {
          language: 'auto',
          threshold: 0.5,
        }
      );

      this.updateProgress(60);

      // 解析脱敏后的文本，根据分隔符拆分回各个片段
      const SEPARATOR = '\n---SEGMENT_BREAK---\n';
      const desensitizedLines = response.desensitized_text.split(SEPARATOR);

      const desensitizedSegments = [];
      const totalSegments = this.result.mergedSegments.length;

      for (let i = 0; i < totalSegments; i++) {
        const originalSegment = this.result.mergedSegments[i];
        let desensitizedText = originalSegment.text; // 默认保留原文

        // 查找对应的脱敏行
        const line = desensitizedLines.find(l => l.startsWith(`[${i}]`));
        if (line) {
          // 移除 [index] 前缀
          desensitizedText = line.replace(/^\[\d+\]/, '');
        } else {
          console.warn(`[RecordingSummaryTask] 片段 ${i} 未找到脱敏结果，保留原文`);
        }

        desensitizedSegments.push({
          ...originalSegment,
          text: desensitizedText,
        });

        // 更新进度
        const progress = 60 + Math.round(((i + 1) / totalSegments) * 40);
        this.updateProgress(progress);
      }

      // 更新结果
      this.result = {
        ...this.result,
        desensitizedSegments,
        desensitizedAt: new Date().toISOString(),
      };

      this.updateProgress(100);
      this.completeStage();

      console.log('[RecordingSummaryTask] 脱敏处理完成');
    } catch (err) {
      throw new Error(`脱敏处理失败: ${err.message}`);
    }
  }

  /**
   * 阶段4: 检查错别字
   * 使用 AI 检测并纠正转录文本中的错别字
   */
  async _checkTypos() {
    try {
      // 模拟 AI 检查错别字的进度
      this.updateProgress(30);
      await this._delay(500);

      this.updateProgress(60);
      await this._delay(500);

      this.updateProgress(100);
      this.completeStage();

      console.log('[RecordingSummaryTask] 错别字检查完成');
    } catch (err) {
      throw new Error(`错别字检查失败: ${err.message}`);
    }
  }

  /**
   * 阶段5: 等待专家审核结果
   * 打开专家审核窗口，等待用户确认
   * 
   * @param {object} windowManager - 窗口管理器实例（可选）
   */
  async _waitForExpertReview(windowManager = null) {
    try {
      console.log('[RecordingSummaryTask] 等待专家审核...');

      // 构造审核数据（从听写和脱敏结果中提取）
      const reviewData = this._buildReviewData();

      // 如果提供了 windowManager，直接调用
      if (windowManager) {
        const result = await windowManager.showExpertReviewWindow(reviewData);
        this.expertReviewResult = result;
      } else {
        // 否则通过 IPC 通信（用于测试）
        const result = await this._openExpertReviewWindow(reviewData);
        this.expertReviewResult = result;
      }

      // 专家审核完成后，保存最终结果
      this._saveFinalResults();

      // 标记阶段完成
      this.updateProgress(100);
      this.completeStage();

      console.log('[RecordingSummaryTask] 专家审核完成并已保存结果');
    } catch (err) {
      throw new Error(`专家审核失败: ${err.message}`);
    }
  }

  /**
   * 构造审核数据
   * 从听写结果中提取 speaker 和卡片信息
   */
  _buildReviewData() {
    // 优先使用脱敏后的 segments，如果没有则使用原始 segments
    const segments = this.result?.desensitizedSegments || this.result?.mergedSegments || this.result?.segments || [];

    if (segments.length === 0) {
      console.warn('[RecordingSummaryTask] 没有转录数据，返回空审核数据');
      return {
        speakers: [],
        cards: []
      };
    }

    // 提取所有唯一的 speaker
    const speakerMap = new Map();
    const colors = [
      '#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de',
      '#5856d6', '#ff2d55', '#5ac8fa', '#ffcc00', '#8e8e93',
      '#00c7be', '#ff6b6b'
    ];

    segments.forEach(segment => {
      if (!speakerMap.has(segment.speaker)) {
        const colorIndex = speakerMap.size % colors.length;
        speakerMap.set(segment.speaker, {
          name: segment.speaker,
          color: colors[colorIndex]
        });
      }
    });

    const speakers = Array.from(speakerMap.values());
    
    // 调试日志
    console.log('[RecordingSummaryTask] Speakers:', speakers.map(s => s.name));

    // 创建卡片
    const cards = segments.map((segment, index) => {
      const speakerIndex = speakers.findIndex(s => s.name === segment.speaker);
      
      // 调试日志：显示每个卡片的 speaker 匹配情况
      if (index < 5) { // 只打印前5个
        console.log(`[RecordingSummaryTask] Card ${index}: segment.speaker="${segment.speaker}", speakerIndex=${speakerIndex}`);
      }
      
      return {
        id: `card-${index}-${Date.now()}`,
        speakerIndex: speakerIndex >= 0 ? speakerIndex : 0,
        content: segment.text,
        timestamp: {
          start: segment.start,
          end: segment.end
        }
      };
    });
    
    // 统计每个 speaker 的卡片数量
    const speakerCounts = {};
    cards.forEach(card => {
      const count = speakerCounts[card.speakerIndex] || 0;
      speakerCounts[card.speakerIndex] = count + 1;
    });
    console.log('[RecordingSummaryTask] 卡片分布:', speakerCounts);

    console.log(`[RecordingSummaryTask] 构建审核数据: ${speakers.length} 个 speakers, ${cards.length} 个卡片`);

    return {
      speakers,
      cards
    };
  }

  /**
   * 保存最终结果（专家审核后的数据）
   * 将专家编辑后的内容保存为 JSON 和 Markdown
   */
  _saveFinalResults() {
    if (!this.expertReviewResult) {
      console.warn('[RecordingSummaryTask] 没有专家审核结果，跳过保存');
      return;
    }

    // 将专家审核结果转换为 segments 格式
    const finalSegments = this.expertReviewResult.cards.map(card => {
      const speaker = this.expertReviewResult.speakers[card.speakerIndex];
      return {
        speaker: speaker ? speaker.name : '未知',
        text: card.content || '',
        start: card.timestamp?.start || 0,
        end: card.timestamp?.end || 0,
      };
    });

    // 更新 result
    this.result = {
      ...this.result,
      segments: finalSegments,
      mergedSegments: this._mergeConsecutiveSpeakers(finalSegments),
      expertReviewed: true,
      reviewedAt: new Date().toISOString(),
    };

    // 保存 JSON 和 Markdown 文件
    this._saveTranscriptionResults(this.result.mergedSegments);
    
    console.log('[RecordingSummaryTask] 最终结果已保存');
  }

  /**
   * 打开专家审核窗口并等待结果（通过 IPC）
   */
  async _openExpertReviewWindow(reviewData) {
    return new Promise((resolve, reject) => {
      try {
        // 通过 IPC 通知主进程打开专家审核窗口
        const { ipcRenderer } = require('electron');
        
        // 监听审核完成事件
        ipcRenderer.once('expert-review:completed', (_event, result) => {
          resolve(result);
        });

        ipcRenderer.once('expert-review:cancelled', (_event) => {
          reject(new Error('专家审核已取消'));
        });

        // 发送打开窗口请求
        ipcRenderer.send('expert-review:open', reviewData);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 阶段6: 正在上传
   * 将处理完成的纪要文件上传到服务器
   */
  async _upload() {
    try {
      // 模拟上传进度
      this.updateProgress(30);
      await this._delay(400);

      this.updateProgress(60);
      await this._delay(400);

      this.updateProgress(100);
      this.completeStage();

      console.log('[RecordingSummaryTask] 上传完成');
    } catch (err) {
      throw new Error(`上传失败: ${err.message}`);
    }
  }
}

module.exports = { RecordingSummaryTask };
