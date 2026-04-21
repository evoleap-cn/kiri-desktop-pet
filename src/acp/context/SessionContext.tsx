import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { AcpSession, ChatMessage } from '../types'

interface SessionContextValue {
  sessionId: string
  messages: ChatMessage[]
  isLoading: boolean
  sendMessage: (content: string) => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 加载会话消息
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const sessions = await window.acpAPI.listSessions()
        const session = sessions.find(s => s.id === sessionId)
        if (session) {
          setMessages(session.messages)
        }
      } catch (error) {
        console.error('Failed to load messages:', error)
      }
    }
    loadMessages()
  }, [sessionId])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const response = await window.acpAPI.sendMessage({
        sessionId,
        message: content.trim(),
      })

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Failed to send message:', error)
      // 添加错误消息
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: '抱歉，发送消息时出错了。请稍后重试。',
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, isLoading])

  return (
    <SessionContext.Provider value={{ sessionId, messages, isLoading, sendMessage }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return context
}
