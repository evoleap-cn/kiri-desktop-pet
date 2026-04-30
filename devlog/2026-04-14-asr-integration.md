# 开发日志 2026-04-14 — ASR 语音识别集成

## 目标
为 Electron 桌面宠物集成 FunASR fun-asr-nano 流式语音识别，实现：
- F9 快捷键切换录音
- ASR 服务启动时显示加载动画
- 流式识别结果浮层显示
- 识别完成自动注入到系统活动输入框

## 技术架构
```
[Electron Main] ← IPC → [Renderer (Web Audio)]
     ↑↓ WebSocket
[Python asr-server.py → FunASR-Nano-2512]
```

## 完成事项

### 1. Python ASR 服务端 (`src/asr-server.py`)
- 从本地路径加载模型，不联网下载
- 添加模型缓存机制：首次加载后将 `torch.save` 序列化到 `model_cached.pt`，后续 `torch.load` 直接加载（启动时间从 ~50s 降至 ~9s）
- WebSocket 双向通信：接收 PCM 16kHz Int16 音频，发送 JSON 识别结果

### 2. Electron 管理 Python 子进程 (`src/asr-bridge.js`)
- spawn Python 进程，监控 stdout/stderr
- WebSocket 连接到本地 ASR 服务
- 新增 `onConnected` 回调（WS 连接成功时触发）
- 音频采集由 Web Audio API 接管（不再使用 Python PyAudio）

### 3. 主进程 (`src/main.js`)
- 应用启动时自动初始化 ASR 桥接并启动 Python 服务
- `asr:status` / `asr:error` / `asr:server-ready` 等 IPC 消息通知 renderer
- `asr:audio-data` IPC 接收 renderer 音频数据并转发给 ASR bridge
- 文本注入：Ctrl+V via PowerShell SendKeys（Windows）

### 4. Renderer 音频采集 (`src/renderer.js`)
- Web Audio API: `getUserMedia` → `AudioContext` → `ScriptProcessorNode`
- **关键修复**: `ScriptProcessorNode` 必须连接 `audioContext.destination` 才能触发 `onaudioprocess`
- **关键修复**: `createScriptProcessor` buffer size 必须是 2 的幂（256-16384），改为 2048

### 5. 加载动画 UI (`src/index.html` + CSS)
- SVG 上叠加毛玻璃半透明加载圈
- 默认显示，WebSocket 连接成功后 `executeJavaScript` 直接调用 `hideLoading()` 隐藏

### 6. 日志转发 (`src/preload.js`)
- Renderer 的 `console.log` 通过 IPC `_log` 转发到主进程终端
- 开发者无需开 DevTools 也能在终端看到音频采集状态

## 未解决问题
- 文字上屏功能未验证（Python 端最终结果返回 `text=""` 导致未触发注入）
- 终端中文日志乱码（GBK vs UTF-8 编码问题，不影响实际功能）
- ASR 返回空最终结果：可能是 Python 端 `stop` 命令时 buffer 已处理完所有音频，剩余不足 100ms

## 性能数据
| 阶段 | 耗时 |
|------|------|
| 首次启动（无缓存） | ~50s |
| 首次启动（有缓存） | ~9s |
| 模型推理 | 流式，每 chunk ~100ms |
| 端到端延迟 | ~200-300ms |
