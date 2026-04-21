# ACP 对话窗口使用指南

## 功能说明

ACP 对话窗口是一个独立的 AI 对话界面，使用 React + Vite + Tailwind CSS 构建。

### 主要功能

- ✅ 会话管理（创建、切换、删除）
- ✅ 消息发送和接收
- ✅ Markdown 渲染
- ✅ 自定义标题栏（Windows 无边框窗口）
- ✅ 主题系统（Dark Mode）
- ⏳ ACP 协议后端（当前为 Mock 实现）

## 开发模式

### 1. 启动 Vite 开发服务器

```bash
npm run dev:acp
```

这会在 `http://localhost:5174` 启动开发服务器。

### 2. 启动 Electron 应用

在另一个终端：

```bash
npm start
```

### 3. 打开 ACP 窗口

点击系统托盘图标，选择 "ACP 对话"。

## 生产构建

### 1. 构建前端

```bash
npm run build:acp
```

构建产物会输出到 `dist/acp/` 目录。

### 2. 启动应用

```bash
npm start
```

应用会自动加载构建好的前端文件。

### 3. 打包应用

```bash
npm run build:linux
```

打包时会自动包含 `dist/acp/` 目录。

## 使用说明

### 创建会话

1. 点击侧边栏的 "新建会话" 按钮
2. 或者在空状态页面点击 "创建新会话"

### 发送消息

1. 在输入框中输入消息
2. 按 Enter 发送（Shift+Enter 换行）
3. 或点击 "发送" 按钮

### 切换会话

点击侧边栏中的会话项即可切换。

### 删除会话

点击会话项右侧的删除按钮（×）。

## 当前限制（Mock 实现）

- 消息响应是固定的占位文本
- 会话数据仅存储在内存中，重启后丢失
- 不支持流式响应
- 不支持工具调用显示
- 不支持文件附件

## 未来扩展

当接入真实 ACP 后端时，需要修改：

1. `src/main.js` 中的 IPC 处理器（`acp:send-message` 等）
2. 实现流式响应（SSE 或 WebSocket）
3. 添加工具调用显示组件
4. 实现会话持久化（SQLite 或文件存储）
5. 添加代码高亮（highlight.js）

## 技术栈

- **React 18** - UI 框架
- **Vite 6** - 构建工具
- **Tailwind CSS 4** - 样式框架
- **TypeScript** - 类型系统
- **marked** - Markdown 渲染

## 目录结构

```
src/acp/
├── components/          # UI 组件
│   ├── ChatPanel.tsx   # 消息显示区域
│   ├── Home.tsx        # 空状态欢迎页
│   ├── PromptInput.tsx # 输入框
│   ├── Sidebar.tsx     # 会话列表侧边栏
│   └── Titlebar.tsx    # 自定义标题栏
├── context/            # 状态管理
│   ├── SessionContext.tsx  # 会话状态
│   └── ThemeContext.tsx    # 主题管理
├── styles/             # 样式文件
│   ├── index.css       # 全局样式
│   └── theme.css       # 主题变量
├── App.tsx             # 根组件
├── index.html          # HTML 入口
├── main.tsx            # React 入口
├── preload.cjs         # Electron preload
├── types.ts            # TypeScript 类型
├── vite.config.ts      # Vite 配置
├── tailwind.config.js  # Tailwind 配置
└── tsconfig.json       # TypeScript 配置
```

## 故障排查

### 窗口显示空白

1. 检查是否运行了 `npm run dev:acp` 或 `npm run build:acp`
2. 查看开发者工具（F12）的控制台错误

### 样式显示异常

1. 确认 Tailwind CSS 正确安装
2. 检查 `dist/acp/assets/` 中是否有 CSS 文件

### 消息发送失败

1. 检查主进程的 IPC 处理器是否正确注册
2. 查看主进程控制台的错误日志

## 贡献

欢迎提交 Issue 和 Pull Request！
