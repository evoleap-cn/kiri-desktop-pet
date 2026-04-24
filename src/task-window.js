// Task Window Renderer
// Handles: task list rendering, status updates, animations

const taskListEl = document.getElementById('task-list');
const emptyStateEl = document.getElementById('empty-state');

// Store task data by ID
const taskMap = new Map();

// Track expanded task cards to preserve state on re-render
const expandedTaskIds = new Set();

// ─── SVG Icons ─────────────────────────────────────────────────────────────

const ICONS = {
  pending: `<svg class="task-icon status-pending" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
  </svg>`,
  running: `<svg class="task-icon status-running" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="10">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
    </circle>
    <path d="M12 6v6l4 2" stroke-linejoin="round"/>
  </svg>`,
  completed: `<svg class="task-icon status-completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>`,
  failed: `<svg class="task-icon status-failed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>`,
  stagePending: `<svg class="stage-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="8" cy="8" r="5"/>
    <circle cx="8" cy="8" r="2" fill="currentColor"/>
  </svg>`,
  stageRunning: `<svg class="stage-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="8" cy="8" r="5"/>
    <circle cx="8" cy="8" r="2" fill="currentColor">
      <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite"/>
    </circle>
  </svg>`,
  stageCompleted: `<svg class="stage-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="5"/>
    <path d="M6 8l1.5 1.5L10 7"/>
  </svg>`,
  stageFailed: `<svg class="stage-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="8" cy="8" r="5"/>
    <line x1="10" y1="6" x2="6" y2="10"/>
    <line x1="6" y1="6" x2="10" y2="10"/>
  </svg>`,
  stageSkipped: `<svg class="stage-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="8" cy="8" r="5" stroke-dasharray="2 2"/>
    <line x1="6" y1="6" x2="10" y2="10" stroke="#8e8e93"/>
  </svg>`,
};

// ─── Status Text Mapping ───────────────────────────────────────────────────

const STATUS_TEXT = {
  pending: '等待中',
  running: '进行中',
  paused: '已暂停',
  failed: '失败',
  completed: '已完成',
};

// ─── Render Functions ──────────────────────────────────────────────────────

function renderTaskList(taskList) {
  // Collect current task IDs from DOM (to track which no longer exist)
  const existingCardIds = new Set();
  taskListEl.querySelectorAll('.task-card').forEach(el => {
    existingCardIds.add(el.dataset.taskId);
  });

  // Remove cards for tasks that no longer exist
  existingCardIds.forEach(id => {
    if (!taskList.some(t => t.id === id)) {
      const card = taskListEl.querySelector(`[data-task-id="${id}"]`);
      if (card) card.remove();
      expandedTaskIds.delete(id); // Clean up expanded state
    }
  });

  if (taskList.length === 0) {
    emptyStateEl.style.display = 'flex';
    return;
  }

  emptyStateEl.style.display = 'none';

  // Update or create cards
  taskList.forEach(taskData => {
    taskMap.set(taskData.id, taskData);
    let card = taskListEl.querySelector(`[data-task-id="${taskData.id}"]`);

    if (card) {
      // Update existing card, preserving expanded state
      updateCardContent(card, taskData);
    } else {
      // Create new card
      const newCard = createTaskCard(taskData);
      // Restore expanded state if was expanded
      if (expandedTaskIds.has(taskData.id)) {
        newCard.classList.add('expanded');
      }
      taskListEl.appendChild(newCard);
    }
  });
}

function createTaskCard(taskData) {
  const card = document.createElement('div');
  card.className = `task-card ${taskData.status === 'running' ? 'active' : ''}`;
  card.dataset.taskId = taskData.id;

  // Restore expanded state if was expanded
  if (expandedTaskIds.has(taskData.id)) {
    card.classList.add('expanded');
  }

  renderCardContent(card, taskData);

  // Click to expand/collapse
  card.addEventListener('click', () => {
    card.classList.toggle('expanded');
    if (card.classList.contains('expanded')) {
      expandedTaskIds.add(taskData.id);
    } else {
      expandedTaskIds.delete(taskData.id);
    }
  });

  return card;
}

function renderCardContent(card, taskData) {
  const statusText = STATUS_TEXT[taskData.status] || taskData.status;
  const stageName = taskData.currentStageName || '';
  const progressClass = taskData.status === 'failed' ? 'failed' : taskData.status === 'completed' ? 'completed' : '';

  card.innerHTML = `
    <div class="task-header">
      ${ICONS[taskData.status] || ICONS.pending}
      <div class="task-info">
        <div class="task-name">${escapeHtml(taskData.name)}</div>
        <div class="task-status-text">${stageName ? escapeHtml(stageName) + ' · ' : ''}${statusText}</div>
      </div>
    </div>
    <div class="progress-container">
      <div class="progress-bar ${progressClass}" style="width: ${taskData.totalProgress}%"></div>
    </div>
    <div class="task-stages">
      ${renderStages(taskData)}
    </div>
  `;
}

function updateCardContent(card, taskData) {
  renderCardContent(card, taskData);
}

function renderStages(taskData) {
  if (!taskData.stages || taskData.stages.length === 0) return '';

  return taskData.stages.map((stage, index) => {
    const isCurrent = index === taskData.currentStageIndex;
    let stageIcon = ICONS.stagePending;
    let stageNameClass = '';
    let progressText = stage.progress + '%';

    switch (stage.status) {
      case 'running':
        stageIcon = ICONS.stageRunning;
        stageNameClass = 'current';
        break;
      case 'completed':
        stageIcon = ICONS.stageCompleted;
        progressText = '完成';
        break;
      case 'failed':
        stageIcon = ICONS.stageFailed;
        progressText = '失败';
        break;
      case 'skipped':
        stageIcon = ICONS.stageSkipped;
        stageNameClass = 'skipped';
        progressText = '跳过';
        break;
    }

    return `
      <div class="stage-item">
        ${stageIcon}
        <span class="stage-name ${stageNameClass}">${escapeHtml(stage.name)}</span>
        <span class="stage-progress">${progressText}</span>
      </div>
    `;
  }).join('');
}

function updateTaskCard(taskData) {
  taskMap.set(taskData.id, taskData);
  let card = taskListEl.querySelector(`[data-task-id="${taskData.id}"]`);

  if (card) {
    // Update existing card, preserving expanded state
    updateCardContent(card, taskData);
  } else {
    // Create new card
    const newCard = createTaskCard(taskData);
    taskListEl.insertBefore(newCard, taskListEl.firstChild);
  }
}

// ─── Utility ───────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Event Handlers ────────────────────────────────────────────────────────

// Receive task list updates from main process
window.taskAPI.onTaskListUpdate((taskList) => {
  renderTaskList(taskList);
});

// Receive single task updates
window.taskAPI.onTaskUpdate((taskData) => {
  updateTaskCard(taskData);
});

// Header buttons
document.getElementById('close-btn').addEventListener('click', () => {
  window.taskAPI.closeWindow();
});

document.getElementById('minimize-btn').addEventListener('click', () => {
  window.taskAPI.minimizeWindow();
});

// Request initial task list
window.taskAPI.requestTaskList();
