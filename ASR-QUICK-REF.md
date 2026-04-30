# 🎤 ASR 语音识别快速参考

## ✅ 迁移完成

CapsWriter-Offline 已成功迁移到原生 Web Audio + WebSocket ASR 架构！

---

## 🚀 快速开始

### 1. 启动应用
```bash
npm start
```

### 2. 使用语音识别
- **按下 F9**: 开始录音（看到红色脉冲动画）
- **说话**: 音频实时传输到 ASR 服务器
- **再按 F9**: 停止录音，自动注入识别结果

---

## ⚙️ 配置

### 修改 ASR 服务器地址

在 `src/main.js` 中修改：

```javascript
const ASR_CONFIG = {
  serverUrl: process.env.ASR_SERVER_URL || "ws://192.168.1.66:8000/ws/v1/asr",
  hotkey: "F9",
  sampleRate: 16000,
  heartbeatInterval: 30000,
  reconnectDelay: 3000,
};
```

### 使用环境变量

```bash
# Windows (PowerShell)
$env:ASR_SERVER_URL="ws://your-server:8000/ws/v1/asr"
npm start

# Linux/Mac
ASR_SERVER_URL=ws://your-server:8000/ws/v1/asr npm start
```

---

## 🏗️ 新架构概览

```
[用户按下 F9]
    ↓
[渲染进程: AudioWorklet 录音]
    ↓ (PCM Int16, 16kHz)
[主进程: WebSocket 客户端]
    ↓ (流式传输)
[ASR 服务器: ws://192.168.1.66:8000]
    ↓ (识别结果)
[主进程: 接收并推送前端]
    ↓
[渲染进程: 显示 + 自动注入]
```

---

## 📁 关键文件

| 文件 | 作用 |
|------|------|
| `src/main.js` | 主进程：热键管理、WebSocket 连接、文本注入 |
| `src/preload.js` | IPC 桥接：暴露 API 到渲染进程 |
| `src/renderer.js` | 渲染进程：AudioWorklet 录音、UI 显示 |
| `src/pcm-processor.js` | AudioWorklet：Float32 → Int16 PCM 转换 |

---

## 🔍 调试

### 查看日志

启动时查看控制台输出：

```bash
npm start
```

关键日志：
- `[ASR] Hotkey F9 registered` - 热键注册成功
- `[ASR] Connecting to ws://...` - WebSocket 连接中
- `[ASR] WebSocket connected` - 连接成功
- `[ASR] Recording started` - 录音开始
- `[ASR] Text injected: ...` - 文本注入成功

### 常见问题

**Q: F9 热键不工作**
- 检查控制台是否有 `Failed to register hotkey` 错误
- 尝试修改 `ASR_CONFIG.hotkey` 为其他按键

**Q: 录音没有声音**
- 检查麦克风权限
- macOS: 确保 `Info.plist` 中有 `NSMicrophoneUsageDescription`

**Q: WebSocket 连接失败**
- 检查 ASR 服务器是否运行
- 检查防火墙设置
- 查看控制台错误日志

---

## 🎯 WebSocket 协议

### 连接地址
```
ws://192.168.1.66:8000/ws/v1/asr
```

### 消息格式

**启动转录** (连接后发送):
```json
{
  "header": {
    "namespace": "SpeechTranscriber",
    "name": "StartTranscription",
    "appkey": "default"
  },
  "payload": {
    "format": "pcm",
    "sample_rate": 16000,
    "enable_intermediate_result": true,
    "enable_punctuation_prediction": true,
    "enable_inverse_text_normalization": true
  }
}
```

**停止转录** (停止录音时发送):
```json
{
  "header": {
    "namespace": "SpeechTranscriber",
    "name": "StopTranscription"
  }
}
```

### 接收消息

**中间结果** (`TranscriptionResultChanged`):
```json
{
  "header": { "name": "TranscriptionResultChanged" },
  "payload": { "result": "识别中的文本..." }
}
```

**最终结果** (`TranscriptionCompleted`):
```json
{
  "header": { "name": "TranscriptionCompleted" },
  "payload": { "result": "最终识别文本" }
}
```

---

## 📝 待办事项

- [ ] 添加录音时长限制（防止过长）
- [ ] 添加音频波形可视化显示
- [ ] 支持多个 ASR 服务器配置
- [ ] 添加录音音量检测
- [ ] 支持自定义热键配置 UI

---

## 📚 相关文档

- [完整迁移文档](./2026-04-17-capswriter-migration.md)
- [ASR 集成日志](./2026-04-14-asr-integration.md)
- [CapsLock 竞态 Bug 修复](./2026-04-15-capslock-race-condition.md)

---

**最后更新**: 2026-04-17
