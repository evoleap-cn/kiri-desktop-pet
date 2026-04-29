/**
 * Expert Review Window - Renderer Process
 * Handles the UI for expert review of transcribed content
 */

class ExpertReviewWindow {
  constructor() {
    this.reviewData = {
      speakers: [],
      cards: []
    };
    this.editingCardId = null;
    this.autoSaveTimer = null;
    
    this.init();
  }

  init() {
    // 绑定按钮事件
    document.getElementById('minimize-btn').addEventListener('click', () => this.minimizeWindow());
    document.getElementById('add-speaker-btn').addEventListener('click', () => this.addSpeaker());
    document.getElementById('cancel-btn').addEventListener('click', () => this.minimizeWindow());
    document.getElementById('confirm-btn').addEventListener('click', () => this.confirmReview());

    // 监听来自主进程的数据
    window.reviewAPI.onReviewData((data) => {
      this.loadReviewData(data);
    });

    // 阻止窗口关闭
    window.addEventListener('beforeunload', (e) => {
      e.preventDefault();
      e.returnValue = '';
      // 最小化而不是关闭
      this.minimizeWindow();
    });
  }

  /**
   * 加载审核数据
   */
  loadReviewData(data) {
    this.reviewData = {
      speakers: data.speakers || [],
      cards: data.cards || []
    };
    
    this.renderSpeakerBar();
    this.renderCards();
  }

  /**
   * 渲染 Speaker 栏
   */
  renderSpeakerBar() {
    const speakerBar = document.getElementById('speaker-bar');
    const addBtn = document.getElementById('add-speaker-btn');
    
    // 清除现有的 speaker 标签（保留添加按钮）
    const existingTags = speakerBar.querySelectorAll('.speaker-tag');
    existingTags.forEach(tag => tag.remove());

    // 渲染每个 speaker
    this.reviewData.speakers.forEach((speaker, index) => {
      const tag = document.createElement('div');
      tag.className = 'speaker-tag';
      tag.title = '双击编辑名称';
      tag.innerHTML = `
        <div class="speaker-color" style="background: ${speaker.color}"></div>
        <span>${speaker.name}</span>
      `;
      tag.addEventListener('click', () => this.focusSpeakerCards(index));
      
      // 双击编辑 Speaker 名称
      tag.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.editSpeakerName(index, tag);
      });
      
      speakerBar.insertBefore(tag, addBtn);
    });
  }

  /**
   * 渲染卡片列表
   */
  renderCards() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';

    if (this.reviewData.cards.length === 0) {
      container.innerHTML = `
        <div id="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p>暂无内容，点击卡片间的 + 插入新卡片</p>
        </div>
      `;
      return;
    }

    this.reviewData.cards.forEach((card, index) => {
      // 插入线（在卡片前）
      if (index === 0 || this.reviewData.cards.length > 1) {
        const insertLine = this.createInsertLine(index);
        container.appendChild(insertLine);
      }

      // 卡片
      const cardWrapper = document.createElement('div');
      cardWrapper.className = 'card-wrapper';
      cardWrapper.dataset.cardId = card.id;

      const cardEl = this.createCardElement(card, index);
      cardWrapper.appendChild(cardEl);
      container.appendChild(cardWrapper);
    });

    // 最后一个插入线
    if (this.reviewData.cards.length > 0) {
      const lastInsertLine = this.createInsertLine(this.reviewData.cards.length);
      container.appendChild(lastInsertLine);
    }
  }

  /**
   * 创建插入线
   */
  createInsertLine(insertIndex) {
    const insertLine = document.createElement('div');
    insertLine.className = 'insert-line';
    insertLine.addEventListener('click', () => this.insertCard(insertIndex));
    return insertLine;
  }

  /**
   * 创建卡片元素
   */
  createCardElement(card, index) {
    const cardEl = document.createElement('div');
    cardEl.className = 'review-card';
    cardEl.style.borderLeftColor = this.getSpeakerColor(card.speakerIndex);

    // 卡片头部
    const header = document.createElement('div');
    header.className = 'card-header';

    // Speaker 选择器
    const speakerSelect = document.createElement('select');
    speakerSelect.className = 'card-speaker-select';
    
    // 先添加所有 options
    this.reviewData.speakers.forEach((speaker, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = speaker.name;
      speakerSelect.appendChild(option);
    });
    
    // 然后设置选中的值
    speakerSelect.value = card.speakerIndex;
    
    // 调试日志
    console.log(`[Card ${card.id}] speakerIndex: ${card.speakerIndex}, select.value: ${speakerSelect.value}`);
    
    speakerSelect.addEventListener('change', (e) => {
      card.speakerIndex = parseInt(e.target.value);
      cardEl.style.borderLeftColor = this.getSpeakerColor(card.speakerIndex);
      this.autoSave();
    });

    // 删除按钮（垃圾桶图标）
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-delete-btn';
    deleteBtn.title = '删除卡片';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    deleteBtn.addEventListener('click', () => this.deleteCard(card.id));

    header.appendChild(speakerSelect);
    header.appendChild(deleteBtn);
    cardEl.appendChild(header);

    // 卡片内容
    const content = document.createElement('div');
    content.className = 'card-content';

    const textEl = document.createElement('div');
    textEl.className = 'card-text';
    textEl.textContent = card.content || '点击编辑内容...';

    // 点击编辑
    textEl.addEventListener('click', () => {
      if (!textEl.classList.contains('editing')) {
        this.startEditing(textEl, card);
      }
    });

    content.appendChild(textEl);
    cardEl.appendChild(content);

    return cardEl;
  }

  /**
   * 开始编辑卡片
   */
  startEditing(textEl, card) {
    textEl.classList.add('editing');
    
    const textarea = document.createElement('textarea');
    textarea.value = card.content || '';
    
    textEl.innerHTML = '';
    textEl.appendChild(textarea);
    textarea.focus();
    textarea.select();

    // 失去焦点时保存
    textarea.addEventListener('blur', () => {
      card.content = textarea.value;
      textEl.textContent = card.content || '点击编辑内容...';
      textEl.classList.remove('editing');
      this.autoSave();
    });

    // Ctrl/Cmd + Enter 保存
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        textarea.blur();
      }
    });
  }

  /**
   * 插入新卡片
   */
  insertCard(index) {
    const newCard = {
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      speakerIndex: 0,
      content: ''
    };

    this.reviewData.cards.splice(index, 0, newCard);
    this.renderCards();
    
    // 自动聚焦到新卡片
    setTimeout(() => {
      const newCardEl = document.querySelector(`[data-card-id="${newCard.id}"] .card-text`);
      if (newCardEl) {
        newCardEl.click();
      }
    }, 100);

    this.autoSave();
  }

  /**
   * 删除卡片
   */
  deleteCard(cardId) {
    const index = this.reviewData.cards.findIndex(c => c.id === cardId);
    if (index !== -1) {
      this.reviewData.cards.splice(index, 1);
      this.renderCards();
      this.autoSave();
    }
  }

  /**
   * 添加新 Speaker
   */
  addSpeaker() {
    // 创建模态框
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
      min-width: 300px;
    `;

    const title = document.createElement('h3');
    title.textContent = '添加新 Speaker';
    title.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1d1d1f;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '请输入名称...';
    input.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 6px;
      font-size: 14px;
      outline: none;
      margin-bottom: 16px;
      box-sizing: border-box;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.05);
      cursor: pointer;
      font-size: 14px;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确认';
    confirmBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: #007aff;
      color: white;
      cursor: pointer;
      font-size: 14px;
    `;

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialog.appendChild(title);
    dialog.appendChild(input);
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // 自动聚焦
    setTimeout(() => input.focus(), 100);

    // 关闭函数
    const close = (value) => {
      document.body.removeChild(modal);
      if (value && value.trim()) {
        this._createSpeaker(value.trim());
      }
    };

    // 事件监听
    cancelBtn.addEventListener('click', () => close(''));
    confirmBtn.addEventListener('click', () => close(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        close(input.value);
      }
      if (e.key === 'Escape') {
        close('');
      }
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        close('');
      }
    });
  }

  /**
   * 创建 Speaker
   */
  _createSpeaker(name) {
    const colors = [
      '#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de',
      '#5856d6', '#ff2d55', '#5ac8fa', '#ffcc00', '#8e8e93',
      '#00c7be', '#ff6b6b'
    ];

    const colorIndex = this.reviewData.speakers.length % colors.length;

    this.reviewData.speakers.push({
      name: name,
      color: colors[colorIndex]
    });

    this.renderSpeakerBar();
    this.renderCards();
    this.autoSave();
  }

  /**
   * 聚焦到指定 Speaker 的卡片
   */
  focusSpeakerCards(speakerIndex) {
    const cards = document.querySelectorAll('.card-wrapper');
    cards.forEach(wrapper => {
      const cardId = wrapper.dataset.cardId;
      const card = this.reviewData.cards.find(c => c.id === cardId);
      if (card && card.speakerIndex === speakerIndex) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  /**
   * 编辑 Speaker 名称
   */
  editSpeakerName(speakerIndex, tagElement) {
    const speaker = this.reviewData.speakers[speakerIndex];
    const nameSpan = tagElement.querySelector('span');
    
    // 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.value = speaker.name;
    input.style.cssText = `
      border: none;
      outline: none;
      background: transparent;
      font-size: 13px;
      font-weight: 500;
      width: 100px;
      padding: 2px 4px;
      border-radius: 4px;
    `;
    input.style.background = 'white';
    
    // 替换 span 为 input
    nameSpan.textContent = '';
    nameSpan.appendChild(input);
    input.focus();
    input.select();
    
    // 保存函数
    const save = () => {
      const newName = input.value.trim();
      if (newName && newName !== speaker.name) {
        speaker.name = newName;
        this.renderSpeakerBar();
        this.renderCards();
        this.autoSave();
      } else {
        // 恢复原样
        this.renderSpeakerBar();
      }
    };
    
    // 失去焦点时保存
    input.addEventListener('blur', save);
    
    // 回车保存
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      }
      // ESC 取消
      if (e.key === 'Escape') {
        input.value = speaker.name;
        input.blur();
      }
    });
  }

  /**
   * 获取 Speaker 颜色
   */
  getSpeakerColor(speakerIndex) {
    const speaker = this.reviewData.speakers[speakerIndex];
    return speaker ? speaker.color : '#007aff';
  }

  /**
   * 自动保存（防抖）
   */
  autoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      window.reviewAPI.autoSave(this.reviewData);
    }, 500);
  }

  /**
   * 确认审核完成
   */
  async confirmReview() {
    try {
      const confirmBtn = document.getElementById('confirm-btn');
      confirmBtn.disabled = true;
      confirmBtn.textContent = '保存中...';

      await window.reviewAPI.completeReview(this.reviewData);
      this.closeWindow();
    } catch (error) {
      console.error('[ExpertReview] 保存失败:', error);
      alert('保存失败，请重试');
      
      const confirmBtn = document.getElementById('confirm-btn');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认完成';
    }
  }

  /**
   * 关闭窗口
   */
  closeWindow() {
    window.reviewAPI.closeWindow();
  }

  /**
   * 最小化窗口（存草稿）
   */
  minimizeWindow() {
    console.log('[ExpertReview] 存草稿，最小化窗口');
    // 通过 preload API 通知主进程最小化窗口
    window.reviewAPI.minimizeWindow();
  }
}

// 初始化
const app = new ExpertReviewWindow();
