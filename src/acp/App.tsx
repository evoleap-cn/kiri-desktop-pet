import React, { useState, useCallback, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { SessionProvider } from './context/SessionContext'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { PromptInput } from './components/PromptInput'
import { Home } from './components/Home'
import type { AcpSession } from './types'

function App() {
  const [sessions, setSessions] = useState<AcpSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  // 加载会话列表
  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const list = await window.acpAPI.listSessions()
      setSessions(list.sort((a, b) => b.updatedAt - a.updatedAt))
      if (list.length > 0 && !activeSessionId) {
        setActiveSessionId(list[0].id)
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const handleNewSession = useCallback(async () => {
    try {
      const session = await window.acpAPI.newSession({
        title: `会话 ${sessions.length + 1}`,
      })
      setSessions(prev => [session, ...prev])
      setActiveSessionId(session.id)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }, [sessions.length])

  const handleSessionSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
  }, [])

  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen w-screen bg-[var(--background-base)] text-[var(--text-base)]">
        {/* 标题栏 */}
        <Titlebar />

        <div className="flex flex-1 overflow-hidden">
          {/* 侧边栏 */}
          <Sidebar
            activeSessionId={activeSessionId}
            onSessionSelect={handleSessionSelect}
            onNewSession={handleNewSession}
          />

          {/* 主内容区 */}
          <div className="flex-1 flex flex-col min-w-0">
            {activeSessionId ? (
              <SessionProvider sessionId={activeSessionId}>
                <ChatPanel />
                <PromptInput />
              </SessionProvider>
            ) : (
              <Home onNewSession={handleNewSession} />
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}

export default App
