# 设置窗口功能说明

## 概述
为桌面宠物应用添加了统一的设置窗口，用于管理应用的各项配置。

## 新增文件

### 1. `src/settings-window.html`
设置窗口的 HTML 界面结构，包含：
- 侧边栏导航（4个设置分类）
- ASR 语音识别设置
- 宠物外观设置
- 快捷键设置
- 通用设置

### 2. `src/settings-preload.js`
ContextBridge 安全通信桥接，暴露 `settingsAPI` 给渲染进程：
- `loadSettings()` - 加载设置
- `saveSettings()` - 保存设置
- `testAsrConnection()` - 测试 ASR 连接
- `updateHotkey()` - 更新快捷键
- `exportPrefs()` / `importPrefs()` - 导出/导入设置
- `resetPosition()` - 重置窗口位置
- `setAutoLaunch()` - 设置开机自启

### 3. `src/settings-window.js`
设置窗口的渲染进程交互逻辑：
- 侧边栏导航切换
- 实时滑块数值显示
- 开关切换动画
- ASR 连接测试
- 快捷键录制与更新
- 自动保存设置（500ms 防抖）

## 修改文件

### 1. `src/windows/window-manager.js`
新增三个设置窗口管理函数：
- `createSettings()` - 创建/聚焦设置窗口（500x600）
- `destroySettings()` - 销毁设置窗口
- `getSettingsWin()` - 获取设置窗口实例

### 2. `src/main.js`
**托盘菜单：**
- 添加"设置"菜单项

**IPC 处理程序（8个）：**
- `settings:load` - 加载偏好设置
- `settings:save` - 保存偏好设置
- `asr:test-connection` - 测试 WebSocket 连接
- `hotkey:update` - 更新并注册新热键
- `prefs:export` - 导出设置到文件
- `prefs:import` - 从文件导入设置
- `position:reset` - 重置宠物窗口位置
- `autostart:set` - 设置开机自启

### 3. `src/asr/asr-manager.js`
新增 `toggleRecording()` 方法：
- 切换录音状态（开/关）
- 自动管理 ASR 连接、Overlay、光标追踪
- 供快捷键调用

## 功能特性

### ASR 设置
- ✅ 服务器地址配置（WebSocket URL）
- ✅ AppKey 配置
- ✅ 测试连接功能（5秒超时）

### 宠物外观设置
- ✅ 尺寸调整（80px - 240px）
- ✅ 透明度调整（30% - 100%）

### 快捷键设置
- ✅ 可视化快捷键录制
- ✅ 支持组合键（Ctrl/Shift/Alt/Cmd）
- ✅ ESC 取消
- ✅ 实时更新注册

### 通用设置
- ✅ 开机自启开关
- ✅ 记住窗口位置开关
- ✅ 导出/导入设置（JSON 格式）
- ✅ 重置窗口位置

## 使用方式

### 打开设置窗口
1. 右键点击系统托盘图标
2. 选择"设置"菜单项

### 设置持久化
所有设置自动保存到 `%APPDATA%/kiri-desktop-pet/evoleap-pet-prefs.json`

### 偏好文件格式示例
```json
{
  "x": 100,
  "y": 100,
  "asrServerUrl": "ws://192.168.1.66:8000",
  "asrAppkey": "your-app-key",
  "petSize": 160,
  "petOpacity": 100,
  "asrHotkey": "F9",
  "autostart": false,
  "rememberPosition": true
}
```

## 技术亮点

1. **自动保存**：设置修改后 500ms 自动保存，避免频繁写入
2. **实时预览**：滑块拖动时实时显示数值
3. **快捷键录制**：点击"更改"后进入录制模式，直观捕获按键
4. **连接测试**：ASR 服务器连接测试带超时保护
5. **设置导入导出**：方便备份和迁移配置
6. **窗口位置钳制**：设置窗口创建时自动钳制到屏幕工作区

## 注意事项

- 快捷键修改后立即生效，无需重启应用
- 开机自启设置需要重启系统后生效
- 导入设置会与现有设置合并，不会覆盖
- 设置窗口为多显示器安全设计，自动选择最近显示器
