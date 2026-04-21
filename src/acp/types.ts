export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  streaming?: boolean
}

export interface AcpSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface AcpAPI {
  // 消息发送
  sendMessage: (data: { sessionId: string; message: string }) => Promise<{ content: string }>

  // 会话管理
  listSessions: () => Promise<AcpSession[]>
  newSession: (opts?: { title?: string; directory?: string }) => Promise<AcpSession>
  deleteSession: (sessionId: string) => Promise<void>

  // 窗口控制
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
}

declare global {
  interface Window {
    acpAPI: AcpAPI
  }
}

export {}
