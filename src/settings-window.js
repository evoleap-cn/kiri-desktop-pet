// 设置窗口渲染进程逻辑

(function() {
  "use strict";

  // ─── 窗口控制按钮 ──────────────────────────────────────────
  document.getElementById("close-btn").addEventListener("click", () => {
    window.close();
  });

  document.getElementById("minimize-btn").addEventListener("click", () => {
    window.settingsAPI.minimize();
  });

  // ─── 侧边栏导航 ─────────────────────────────────────────────
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  const sections = document.querySelectorAll(".section");

  sidebarItems.forEach(item => {
    item.addEventListener("click", () => {
      const section = item.dataset.section;
      
      // 更新激活状态
      sidebarItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      
      // 显示对应部分
      sections.forEach(s => s.classList.remove("active"));
      document.getElementById(`section-${section}`).classList.add("active");
    });
  });

  // ─── 加载设置 ───────────────────────────────────────────────
  async function loadSettings() {
    try {
      const settings = await window.settingsAPI.loadSettings();
      
      // ASR 设置
      if (settings.asr) {
        document.getElementById("asr-server-url").value = settings.asr.serverUrl || "";
        document.getElementById("asr-appkey").value = settings.asr.appkey || "";
      }
      
      // 宠物设置
      if (settings.pet) {
        document.getElementById("pet-size").value = settings.pet.size || 160;
        document.getElementById("pet-size-value").textContent = `${settings.pet.size || 160}px`;
        document.getElementById("pet-opacity").value = settings.pet.opacity || 100;
        document.getElementById("pet-opacity-value").textContent = `${settings.pet.opacity || 100}%`;
      }
      
      // 快捷键设置
      if (settings.hotkeys) {
        document.getElementById("asr-hotkey-display").textContent = settings.hotkeys.asr || "F9";
      }
      
      // 通用设置
      if (settings.general) {
        if (settings.general.autostart) {
          document.getElementById("toggle-autostart").classList.add("active");
        }
        if (settings.general.rememberPosition !== false) {
          document.getElementById("toggle-remember-position").classList.add("active");
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  // ─── 滑块交互 ───────────────────────────────────────────────
  const petSizeSlider = document.getElementById("pet-size");
  const petSizeValue = document.getElementById("pet-size-value");
  petSizeSlider.addEventListener("input", () => {
    petSizeValue.textContent = `${petSizeSlider.value}px`;
  });

  const petOpacitySlider = document.getElementById("pet-opacity");
  const petOpacityValue = document.getElementById("pet-opacity-value");
  petOpacitySlider.addEventListener("input", () => {
    petOpacityValue.textContent = `${petOpacitySlider.value}%`;
  });

  // ─── 开关交互 ───────────────────────────────────────────────
  document.querySelectorAll(".toggle").forEach(toggle => {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("active");
    });
  });

  // ─── 测试 ASR 连接 ─────────────────────────────────────────
  const btnTestAsr = document.getElementById("btn-test-asr");
  const asrStatus = document.getElementById("asr-status");
  
  btnTestAsr.addEventListener("click", async () => {
    const serverUrl = document.getElementById("asr-server-url").value;
    if (!serverUrl) {
      showStatus(asrStatus, "请输入服务器地址", "error");
      return;
    }
    
    btnTestAsr.disabled = true;
    btnTestAsr.textContent = "测试中...";
    showStatus(asrStatus, "正在连接服务器...", "");
    
    try {
      const result = await window.settingsAPI.testAsrConnection(serverUrl);
      if (result.success) {
        showStatus(asrStatus, "连接成功！", "success");
      } else {
        showStatus(asrStatus, `连接失败: ${result.error}`, "error");
      }
    } catch (error) {
      showStatus(asrStatus, `连接失败: ${error.message}`, "error");
    } finally {
      btnTestAsr.disabled = false;
      btnTestAsr.textContent = "测试连接";
    }
  });

  function showStatus(element, message, type) {
    element.textContent = message;
    element.className = "status-message";
    if (type) {
      element.classList.add(type);
    }
  }

  // ─── 更改快捷键 ─────────────────────────────────────────────
  const btnChangeHotkey = document.getElementById("btn-change-hotkey");
  const hotkeyDisplay = document.getElementById("asr-hotkey-display");
  const hotkeyStatus = document.getElementById("hotkey-status");
  let isRecordingHotkey = false;

  btnChangeHotkey.addEventListener("click", () => {
    if (isRecordingHotkey) return;
    
    isRecordingHotkey = true;
    hotkeyDisplay.classList.add("hotkey-recording");
    hotkeyDisplay.textContent = "等待按键...";
    hotkeyStatus.classList.add("success");
    
    const handler = (e) => {
      e.preventDefault();
      
      // 构建快捷键字符串
      const parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Cmd");
      
      let key = e.key;
      if (key === "Escape") {
        // 取消
        isRecordingHotkey = false;
        hotkeyDisplay.classList.remove("hotkey-recording");
        hotkeyStatus.classList.remove("success");
        hotkeyDisplay.textContent = "已取消";
        window.removeEventListener("keydown", handler);
        setTimeout(() => {
          loadSettings(); // 恢复原值
        }, 1000);
        return;
      }
      
      // 特殊键名处理
      if (key === " ") key = "Space";
      if (key.startsWith("F") && key.length <= 3) {
        // F1-F12
        key = key.toUpperCase();
      }
      
      parts.push(key);
      const hotkey = parts.join("+");
      
      hotkeyDisplay.textContent = hotkey;
      hotkeyDisplay.classList.remove("hotkey-recording");
      hotkeyStatus.classList.remove("success");
      isRecordingHotkey = false;
      
      window.removeEventListener("keydown", handler);
      
      // 保存新热键
      window.settingsAPI.updateHotkey({ asr: hotkey }).then(() => {
        hotkeyStatus.textContent = "热键已更新";
        hotkeyStatus.classList.add("success");
        setTimeout(() => {
          hotkeyStatus.classList.remove("success");
        }, 2000);
      }).catch(err => {
        hotkeyStatus.textContent = `更新失败: ${err.message}`;
        hotkeyStatus.classList.add("error");
      });
    };
    
    window.addEventListener("keydown", handler);
  });

  // ─── 导出/导入设置 ──────────────────────────────────────────
  document.getElementById("btn-export-prefs").addEventListener("click", async () => {
    try {
      await window.settingsAPI.exportPrefs();
      alert("设置已导出");
    } catch (error) {
      alert(`导出失败: ${error.message}`);
    }
  });

  document.getElementById("btn-import-prefs").addEventListener("click", async () => {
    try {
      await window.settingsAPI.importPrefs();
      alert("设置已导入，请重启应用以生效");
      loadSettings();
    } catch (error) {
      alert(`导入失败: ${error.message}`);
    }
  });

  document.getElementById("btn-reset-position").addEventListener("click", async () => {
    try {
      await window.settingsAPI.resetPosition();
      alert("窗口位置已重置");
    } catch (error) {
      alert(`重置失败: ${error.message}`);
    }
  });

  // ─── 保存设置（当设置改变时自动保存） ───────────────────────
  let saveTimeout;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const settings = {
        asr: {
          serverUrl: document.getElementById("asr-server-url").value,
          appkey: document.getElementById("asr-appkey").value,
        },
        pet: {
          size: parseInt(petSizeSlider.value),
          opacity: parseInt(petOpacitySlider.value),
        },
        hotkeys: {
          asr: hotkeyDisplay.textContent,
        },
        general: {
          autostart: document.getElementById("toggle-autostart").classList.contains("active"),
          rememberPosition: document.getElementById("toggle-remember-position").classList.contains("active"),
        },
      };
      
      try {
        await window.settingsAPI.saveSettings(settings);
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
    }, 500);
  }

  // 监听所有输入变化
  document.querySelectorAll("input, .toggle").forEach(el => {
    el.addEventListener("change", autoSave);
    el.addEventListener("input", autoSave);
  });

  // ─── 初始化 ─────────────────────────────────────────────────
  loadSettings();

  // 监听关闭事件
  window.settingsAPI.onClose(() => {
    window.close();
  });
})();
