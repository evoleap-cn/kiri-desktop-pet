// @refresh reload

import { render } from "solid-js/web"
import "./index.css"
import { AppBaseProviders, AppInterface } from "./app"
import { type Platform, PlatformProvider } from "./context/platform"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

// Electron platform implementation
const platform: Platform = {
  platform: "desktop",
  os: "windows",
  version: "1.0.0",
  openLink: (url: string) => {
    window.electron?.openExternal?.(url)
  },
  back: () => {
    window.history.back()
  },
  forward: () => {
    window.history.forward()
  },
  restart: async () => {
    window.location.reload()
  },
  notify: async (title: string, description?: string) => {
    console.log("Notification:", title, description)
  },
  getDefaultServer: async () => null,
  setDefaultServer: () => {},
}

render(
  () => (
    <PlatformProvider value={platform}>
      <AppBaseProviders>
        <AppInterface
          defaultServer={"http://localhost:4096"}
          servers={[{ type: "http", http: { url: "http://localhost:4096" } }]}
          disableHealthCheck={true}
        />
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root
)
