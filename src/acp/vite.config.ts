import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    solidPlugin(),
    tailwindcss(),
    {
      name: "opencode-alias-resolver",
      enforce: "pre",
      resolveId(source) {
        // @opencode-ai/ui/context/xxx -> ../ui/context/xxx.tsx
        if (source.startsWith("@opencode-ai/ui/context/")) {
          const subpath = source.replace("@opencode-ai/ui/context/", "")
          return path.resolve(__dirname, `../ui/context/${subpath}.tsx`)
        }
        // @opencode-ai/ui/context -> ../ui/context/index.ts
        if (source === "@opencode-ai/ui/context") {
          return path.resolve(__dirname, "../ui/context/index.ts")
        }
        // @opencode-ai/ui/theme/xxx -> ../ui/theme/xxx.tsx
        if (source.startsWith("@opencode-ai/ui/theme/")) {
          const subpath = source.replace("@opencode-ai/ui/theme/", "")
          return path.resolve(__dirname, `../ui/theme/${subpath}.tsx`)
        }
        // @opencode-ai/ui/i18n/xxx -> ../ui/i18n/xxx.ts
        if (source.startsWith("@opencode-ai/ui/i18n/")) {
          const subpath = source.replace("@opencode-ai/ui/i18n/", "")
          return path.resolve(__dirname, `../ui/i18n/${subpath}.ts`)
        }
        // @opencode-ai/ui/pierre/xxx -> ../ui/pierre/xxx.ts
        if (source.startsWith("@opencode-ai/ui/pierre/")) {
          const subpath = source.replace("@opencode-ai/ui/pierre/", "")
          return path.resolve(__dirname, `../ui/pierre/${subpath}.ts`)
        }
        // @opencode-ai/ui/pierre -> ../ui/pierre/index.ts
        if (source === "@opencode-ai/ui/pierre") {
          return path.resolve(__dirname, "../ui/pierre/index.ts")
        }
        // @opencode-ai/ui/hooks/xxx -> ../ui/hooks/xxx.ts
        if (source.startsWith("@opencode-ai/ui/hooks/")) {
          const subpath = source.replace("@opencode-ai/ui/hooks/", "")
          return path.resolve(__dirname, `../ui/hooks/${subpath}.ts`)
        }
        // @opencode-ai/ui/hooks -> ../ui/hooks/index.ts
        if (source === "@opencode-ai/ui/hooks") {
          return path.resolve(__dirname, "../ui/hooks/index.ts")
        }
        // @opencode-ai/ui/xxx -> ../ui/components/xxx.tsx (默认组件路径)
        if (source.startsWith("@opencode-ai/ui/")) {
          const subpath = source.replace("@opencode-ai/ui/", "")
          return path.resolve(__dirname, `../ui/components/${subpath}.tsx`)
        }
        // @opencode-ai/sdk/xxx -> ../sdk/xxx.ts
        if (source.startsWith("@opencode-ai/sdk/")) {
          const subpath = source.replace("@opencode-ai/sdk/", "")
          // 检查是否已有扩展名
          if (subpath.endsWith(".ts") || subpath.endsWith(".tsx")) {
            return path.resolve(__dirname, `../sdk/${subpath}`)
          }
          // 尝试 .ts
          return path.resolve(__dirname, `../sdk/${subpath}.ts`)
        }
        // @opencode-ai/shared/xxx -> ../shared/xxx.ts
        if (source.startsWith("@opencode-ai/shared/")) {
          const subpath = source.replace("@opencode-ai/shared/", "")
          // 检查是否已有扩展名
          if (subpath.endsWith(".ts") || subpath.endsWith(".tsx")) {
            return path.resolve(__dirname, `../shared/${subpath}`)
          }
          // 尝试 .ts
          return path.resolve(__dirname, `../shared/${subpath}.ts`)
        }
        return null
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/acp"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
  server: {
    port: 5179,
    host: "127.0.0.1",
  },
})
