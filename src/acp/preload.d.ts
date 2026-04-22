declare global {
  interface Window {
    acpAPI: {
      // 消息
      sendMessage: (data: { sessionId: string; message: string }) => Promise<{ content: string }>

      // 会话管理
      listSessions: () => Promise<Array<{
        id: string
        title: string
        messages: Array<{ role: string; content: string; timestamp: number }>
        createdAt: number
        updatedAt: number
      }>>
      newSession: (opts?: { title?: string }) => Promise<{
        id: string
        title: string
        messages: Array<any>
        createdAt: number
        updatedAt: number
      }>
      deleteSession: (sessionId: string) => Promise<void>

      // 窗口控制
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void

      // 存储 API
      storeGet: (name: string, key: string) => Promise<string | null>
      storeSet: (name: string, key: string, value: string) => Promise<void>
      storeDelete: (name: string, key: string) => Promise<void>
      storeClear: (name: string) => Promise<void>
      storeKeys: (name: string) => Promise<string[]>
      storeLength: (name: string) => Promise<number>
    }
  }
}

export {}
