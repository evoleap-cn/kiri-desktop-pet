# CapsWriter-Offline 迁移至原生 Web Audio + WebSocket ASR

**日期**: 2026-04-17  
**状态**: ✅ 已完成

---

## 📊 迁移原因

1. **消除外部 Python 依赖** - 不再需要 CapsWriter-Offline 项目和 Python 运行时
2. **简化架构** - 从 3 层架构（Python 桥接 + UDP + IPC）简化为 2 层（Electron 主进程 + 渲染进程）
3. **提升性能** - 使用 AudioWorklet 在独立线程处理音频，避免主线程卡顿
4. **更好的跨平台支持** - 不再需要处理 Python 跨平台打包问题

---

## 🔄 架构对比

### 旧架构（CapsWriter-Offline）

```
[Electron Main Process]
  ├── 启动 Python 子进程 (kiri_bridge.py)
  ├── UDP 监听状态事件 (127.0.0.1:6019)
  └── IPC 通信 → [Renderer Process]
                     └── ASR UI 显示

[CapsWriter-Offline 外部项目]
  ├── Python ASR 推理服务
  ├── WebSocket 音频接收
  ├── pynput CapsLock 快捷键监听
  └── UDP 状态推送
```

**问题**:
- ❌ 依赖外部 Python 项目
- ❌ 需要安装 ASR 模型
- ❌ 首次启动慢（模型加载 ~50s）
- ❌ 跨平台打包复杂

### 新架构（原生 Web Audio + WebSocket）

```
[Electron Renderer Process]
  ├── AudioWorklet (pcm-processor.js)
  │   ├── getUserMedia 录音
  │   ├── Float32 → Int16 PCM 转换
  │   └── 16kHz 采样率
  └── IPC 发送 PCM → Main Process

[Electron Main Process]
  ├── 全局热键 F9 (globalShortcut)
  ├── WebSocket 客户端
  │   ├── 连接 ws://192.168.1.66:8000/ws/v1/asr
  │   ├── 流式发送 PCM 数据
  │   ├── 接收 ASR 识别结果
  │   ├── 心跳检测 (30s)
  │   └── 自动重连机制
  └── 文本注入 (Ctrl+V)
```

**优势**:
- ✅ 无外部 Python 依赖
- ✅ 启动速度快（无需加载模型）
- ✅ 架构简单，易于维护
- ✅ AudioWorklet 实时处理，无卡顿

---

## 📝 变更清单

### 修改的文件

| 文件 | 变更说明 |
|------|---------|
| `src/main.js` | 删除 `initAsrBridge()`、UDP 监听，添加 WebSocket 客户端、F9 热键 |
| `src/preload.js` | 更新 ASR IPC API（添加 `sendAudioChunk`、`onToggleRecording` 等） |
| `src/renderer.js` | 删除旧 ASR UI，添加 AudioWorklet 录音逻辑 |
| `src/index.html` | 简化 ASR CSS 和 HTML |
| `package.json` | 添加 `ws` 依赖 |

### 新增的文件

| 文件 | 用途 |
|------|------|
| `src/pcm-processor.js` | AudioWorklet 处理器，实时 PCM 转换 |

### 删除的功能

- ❌ Python 子进程管理 (`initAsrBridge`)
- ❌ UDP 状态监听 (`dgram`)
- ❌ CapsLock 快捷键（由 Python pynput 管理）
- ❌ 外部 ASR 推理服务依赖

---

## 🔧 配置说明

### ASR 服务器配置

在 `src/main.js` 中：

```javascript
const ASR_CONFIG = {
  serverUrl: process.env.ASR_SERVER_URL || "ws://192.168.1.66:8000/ws/v1/asr",
  hotkey: "F9",
  sampleRate: 16000,
  heartbeatInterval: 30000, // 30s
  reconnectDelay: 3000,     // 3s
};
```

**环境变量**:
- `ASR_SERVER_URL` - ASR 服务器 WebSocket 地址
- `ASR_APPKEY` - ASR 应用密钥（可选）

### 自定义热键

修改 `ASR_CONFIG.hotkey` 值：

```javascript
hotkey: "F9"              // 默认
hotkey: "CommandOrControl+Shift+R"  // 跨平台
```

可用的修饰键：`Command`, `Control`, `Alt`, `Shift`, `Super`

---

## 🎯 使用流程

1. **启动应用**: `npm start`
2. **按下 F9**: 开始录音（UI 显示红色脉冲动画）
3. **说话**: 音频实时转换为 PCM 并流式发送到 ASR 服务器
4. **再按 F9**: 停止录音，自动注入识别结果
5. **识别结果**: 实时显示在宠物窗口下方

---

## 🚀 技术细节

### AudioWorklet PCM 转换

`src/pcm-processor.js`:
- 运行在独立音频线程，避免主线程卡顿
- 累积 Float32 样本，每 1600 个样本（~100ms）发送一次
- 转换为 Int16 PCM 格式（S16LE）
- 使用 Transferable Objects 减少内存拷贝

### WebSocket 流式传输

`src/main.js`:
- 连接时发送 `StartTranscription` 消息
- 接收中间结果 (`TranscriptionResultChanged`)
- 接收最终结果 (`TranscriptionCompleted`)
- 每 30 秒发送心跳包
- 断线自动重连（最多 10 次）

### 文本注入

识别完成后自动注入：
- Windows: PowerShell `SendKeys` 模拟 Ctrl+V
- macOS: `osascript` 模拟 Command+V
- Linux: `xdotool` 模拟 Ctrl+V

---

## ⚠️ 注意事项

### 麦克风权限

**首次运行**: 系统会弹出麦克风权限请求

**macOS 额外配置**:
在 `Info.plist` 中添加：
```xml
<key>NSMicrophoneUsageDescription</key>
<string>此应用需要访问麦克风以进行语音识别</string>
```

### 热键冲突

- F9 默认注册为全局热键
- 如果注册失败，控制台会显示错误
- 避免使用系统级快捷键（如 Ctrl+C、Alt+F4）

### 管理员权限程序

当焦点在管理员权限的程序上时，普通 `globalShortcut` 可能无法捕获按键。

**解决方案**: 以管理员权限运行 Electron 应用

---

## 🧪 测试清单

- [x] F9 热键注册和触发
- [ ] 麦克风权限请求
- [ ] AudioWorklet PCM 转换
- [ ] WebSocket 连接和心跳
- [ ] 流式识别结果显示
- [ ] 文本注入功能
- [ ] 断线重连机制
- [ ] 应用退出清理

---

## 📚 相关文档

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

**迁移完成时间**: 2026-04-17  
**下次迭代**: 添加录音时长限制、可视化波形显示
