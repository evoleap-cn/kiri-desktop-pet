# Vite 开发服务器启动问题修复记录

## 问题描述

运行 `npm run dev:acp` 启动 Vite 开发服务器时遇到依赖扫描错误。

## 错误信息

### 错误 1: 文件扩展名解析失败
```
X [ERROR] ENOENT: no such file or directory, open 'D:\Steve\Documents\kiri-desktop-pet\src\ui\theme\color.tsx'
X [ERROR] ENOENT: no such file or directory, open 'D:\Steve\Documents\kiri-desktop-pet\src\ui\theme\resolve.tsx'
```

**原因：** 
- `terminal.tsx` 中引用了 `@opencode-ai/ui/theme/color` 和 `@opencode-ai/ui/theme/resolve`
- Vite 配置的别名解析器将所有 `@opencode-ai/ui/theme/xxx` 路径都解析为 `.tsx` 文件
- 但实际文件是 `color.ts` 和 `resolve.ts`（不是 `.tsx`）

**解决方案：**
修改 `src/acp/vite.config.ts`，添加智能扩展名解析逻辑：

```typescript
import fs from "fs"

const tryResolve = (basePath: string, subpath: string) => {
  // 先尝试 .tsx
  const tsxPath = path.resolve(__dirname, `${basePath}/${subpath}.tsx`)
  if (fs.existsSync(tsxPath)) return tsxPath
  
  // 再尝试 .ts
  const tsPath = path.resolve(__dirname, `${basePath}/${subpath}.ts`)
  if (fs.existsSync(tsPath)) return tsPath
  
  // 默认返回 .tsx（让 Vite 报错更清晰）
  return tsxPath
}
```

然后将所有路径解析逻辑改为使用 `tryResolve`：
```typescript
// 之前：
return path.resolve(__dirname, `../ui/theme/${subpath}.tsx`)

// 之后：
return tryResolve("../ui/theme", subpath)
```

### 错误 2: 缺失依赖包
```
The following dependencies are imported but could not be resolved:
  remend (imported by D:/Steve/Documents/kiri-desktop-pet/src/ui/components/markdown-stream.ts)
```

**原因：**
- `src/ui/components/markdown-stream.ts` 中导入了 `remend` 包
- `package.json` 中没有这个依赖

**解决方案：**
```bash
npm install remend
```

## 修改的文件

1. **src/acp/vite.config.ts** - 添加 `tryResolve` 函数并更新所有路径解析逻辑
2. **package.json** - 新增依赖 `remend`

## 验证结果

✅ Vite 开发服务器成功启动在 `http://127.0.0.1:5179/`

## 使用命令

```bash
npm run dev:acp
```
