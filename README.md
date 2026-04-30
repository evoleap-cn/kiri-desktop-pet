# EvoLeap Desktop Pet

一个基于 Electron 的跨平台桌面宠物应用 — 80×80 透明窗口，像素级命中检测，支持拖拽交互、弹出式功能菜单、托盘控制等能力。

```
 ┌──────────────────────────────────┐
 │          your desktop            │
 │                                  │
 │        ┌──────────┐              │
 │        │ ◼️ E     │ ← 桌面宠物    │
 │        └──────────┘              │
 │                                  │
 │   透明区域穿透 · 实时命中检测      │
 └──────────────────────────────────┘
```

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
</p>

---

## 特性

- **透明区域穿透** — 仅 SVG 不透明区域响应鼠标，透明区域直接穿透到桌面
- **像素级命中检测** — 离屏 Canvas 实时采样 alpha 通道，精确判断可交互区域
- **智能拖拽判定** — 5px 位移阈值自动区分点击与拖拽操作
- **弹出式功能菜单** — 基于宠物窗口位置自适应定位，支持多显示器
- **右键系统菜单** — 重置位置 / 退出应用
- **位置持久化** — 窗口位置自动保存，启动时恢复到上次位置
- **多显示器支持** — 自动选择最近的显示器进行窗口定位
- **系统托盘** — 最小化后可通过托盘图标退出
- **安全架构** — CSP 策略 + contextBridge 隔离渲染进程与主进程

---

## 快速开始

### 环境要求

- Node.js >= 16
- npm

### 安装与运行

```bash
npm install
npm start
```

### 构建

```bash
# Linux
npm run build:linux

# All platforms (当前仅支持 Linux)
npm run build:all
```

---

## 基本操作

| 操作 | 效果 |
|------|------|
| **左键拖拽** | 拖动宠物到屏幕任意位置 |
| **左键点击** | 弹出功能菜单（5 项 + 搜索栏） |
| **右键点击** | 弹出系统菜单（重置位置 / 退出） |
| **点击菜单外部** | 关闭弹出菜单 |
| **按 Escape** | 关闭弹出菜单 |
| **托盘图标** | 右键可退出应用 |

---

## 项目结构

```
kiri-desktop-pet/
├── src/
│   ├── main.js          # 主进程：窗口创建、IPC 处理、托盘、位置持久化
│   ├── preload.js       # 上下文桥接（contextBridge）
│   ├── index.html       # 宠物窗口页面（80×80 透明窗口）
│   ├── renderer.js      # 宠物窗口渲染：SVG 绘制、命中检测、拖拽逻辑
│   ├── popup.html       # 弹出菜单页面（独立 BrowserWindow）
│   └── popup.js         # 弹出菜单交互逻辑（菜单点击 + 搜索）
├── assets/
│   └── svg/
│       └── evoleap-logo.svg    # EvoLeap 品牌图标
├── devlog/
│   └── Steven/                 # 开发日志与日报
├── docs/
│   ├── ARCHITECTURE.md         # 架构文档
│   └── edge-asr-model-selection.md  # 边缘 ASR 模型选型报告
├── package.json
└── README.md
```

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Electron 主进程                    │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  Pet Window  │  │ Popup Window │  │ Tray Icon │  │
│  │  80×80       │◄─┤ 200×280      │  │           │  │
│  │  index.html  │  │ popup.html   │  │           │  │
│  │  renderer.js │  │ popup.js     │  │           │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┘  │
│         │                 │                          │
│         └────────┬────────┘                          │
│                  │ IPC (contextBridge)                │
│                  ▼                                   │
│  ┌───────────────────────────────────────────────┐  │
│  │              IPC Handlers (main.js)             │  │
│  │  move-window-by  ·  drag-start / drag-end      │  │
│  │  set-ignore-mouse  ·  open-menu / close-menu   │  │
│  │  menu-action  ·  open-context-menu             │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 核心机制

#### 1. 透明区域点击穿透

宠物窗口启用 `transparent: true`，通过实时命中检测动态切换穿透状态：

```
用户鼠标移动
    │
    ▼
isOpaqueAt(clientX, clientY)？
    │
    ├── 是（alpha > 10）→ setIgnoreMouseEvents(false)
    │                       可交互 / 拖拽 / 点击
    │
    └── 否（透明区域）  → setIgnoreMouseEvents(true, { forward: true })
                          穿透到底层桌面
```

命中检测实现：将内嵌 SVG 绘制到离屏 Canvas（80×80），通过 `getImageData()` 读取像素 alpha 值判断是否为宠物本体。

#### 2. 点击 vs 拖拽 判定

```
mousedown → 记录起点 (mouseDownX, mouseDownY)，阻止默认行为
    │
mousemove → 位移超过 5px？
    ├── 是 → isDragging = true
    │         → drag-start IPC → 禁用穿透 → 增量移动窗口
    │
mouseup → isDragging？
    ├── 是 → drag-end IPC → 保存位置到本地 → 恢复穿透
    └── 否 → 判定为点击 → open-menu IPC → 弹出/切换菜单
```

#### 3. Popup 菜单智能定位

基于宠物窗口相对坐标（而非鼠标点击坐标）计算弹出位置：

- **纵向**：优先显示在宠物上方，空间不足时切换到下方
- **横向**：优先右对齐到宠物右边缘，空间不足时切换到左对齐
- **多显示器**：遍历所有显示器，选择距离宠物中心最近的显示器进行计算
- **边界保护**：所有坐标 clamp 到工作区内，防止溢出屏幕

#### 4. Popup 关闭与状态恢复

任意路径关闭弹窗（toggle / blur / menu-action / close-menu）时：

```
destroyPopup()
    ├── popupWin.close()
    ├── popupWin = null
    ├── win.setIgnoreMouseEvents(false)       ← 恢复宠物窗口完全交互
    └── win.webContents.send("popup-closed")  ← 通知渲染进程重置缓存
```

渲染进程收到 `popup-closed` 后清除 `lastIgnore` 缓存，确保下次鼠标事件重新计算命中状态，避免进入永久穿透状态。

---

### IPC 通信协议

| 通道 | 方向 | 参数 | 用途 |
|------|------|------|------|
| `move-window-by` | renderer → main | dx, dy | 增量移动宠物窗口 |
| `drag-start` | renderer → main | — | 开始拖拽，禁用穿透 |
| `drag-end` | renderer → main | — | 结束拖拽，保存位置 |
| `set-ignore-mouse` | renderer → main | boolean | 设置/取消鼠标穿透 |
| `open-menu` | renderer → main | — | 打开/切换弹出菜单（toggle） |
| `close-menu` | renderer → main | — | 关闭弹出菜单 |
| `menu-action` | renderer → main | action (string) | 菜单项触发 |
| `open-context-menu` | renderer → main | screenX, screenY | 右键系统菜单 |
| `popup-closed` | main → renderer | — | 通知弹窗已关闭 |

---

### 窗口配置

| 属性 | Pet Window | Popup Window |
|------|------------|--------------|
| 尺寸 | 80×80 | 200×280 |
| frame | false | false |
| transparent | true | true |
| alwaysOnTop | true (screen-saver) | true (screen-saver) |
| resizable | false | false |
| skipTaskbar | true | true |
| hasShadow | false | true |
| type | "toolbar" | "toolbar" |

---

### 数据持久化

宠物窗口位置保存在 `%APPDATA%/kiri-desktop-pet/evoleap-pet-prefs.json`：

```json
{ "x": 1840, "y": 1020 }
```

- 拖拽结束时自动保存，窗口移动事件也会触发
- 启动时读取并 clamp 到当前屏幕工作区
- 偏好文件不存在时使用默认位置（屏幕右下角 -20px 边距）
- 所有文件操作均有 try-catch 保护

---

### 安全特性

- **CSP 策略**：`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`
- **contextBridge**：渲染进程通过安全 API 暴露 IPC 方法，不直接暴露 `ipcRenderer`
- **IPC 防重复注册**：`ipcHandlersRegistered` 标志防止热重载导致重复绑定

---

## 功能菜单

| 菜单项 | 图标 | 说明 |
|--------|------|------|
| Evo快捷框 | ⧉ 堆叠层 | 快捷操作面板 |
| Evo读屏 | 🖥 显示器 | 屏幕内容读取 |
| Evo网盘 | ☁ 云朵 | 云存储访问 |
| 录音纪要 | 🎤 麦克风 | 语音录制与纪要生成 |
| 截屏提问 | </> 代码 | 截屏后向 AI 提问 |

底部搜索栏支持「向Evo提问」快速输入指令。

---

## License

MIT
