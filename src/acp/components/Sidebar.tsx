import React, { useState, useEffect } from 'react'
import type { AcpSession } from '../types'

interface SidebarProps {
  activeSessionId: string | null
  onSessionSelect: (sessionId: string) => void
  onNewSession: () => void
}

export function Sidebar({ activeSessionId, onSessionSelect, onNewSession }: SidebarProps) {
  const [sessions, setSessions] = useState<AcpSession[]>([])

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const list = await window.acpAPI.listSessions()
      setSessions(list.sort((a, b) => b.updatedAt - a.updatedAt))
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个会话吗？')) return

    try {
      await window.acpAPI.deleteSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  return (
    <div className="w-60 h-full bg-[var(--background-surface)] border-r border-[var(--border-base)] flex flex-col">
      {/* 新建会话按钮 */}
      <div className="p-3 border-b border-[var(--border-base)]">
        <button
          onClick={onNewSession}
          className="w-full h-10 flex items-center justify-center gap-2 bg-[var(--surface-strong)] hover:bg-[var(--surface-stronger)] rounded-lg transition-colors text-14-medium"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          新建会话
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-[var(--text-weak)] text-12-regular">
            暂无会话
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSessionSelect(session.id)}
              className={`
                px-3 py-3 cursor-pointer border-b border-[var(--border-base)]
                hover:bg-[var(--surface-strong)] transition-colors
                ${activeSessionId === session.id ? 'bg-[var(--surface-strong)]' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-14-medium text-[var(--text-base)] truncate">
                    {session.title}
                  </div>
                  <div className="text-11-regular text-[var(--text-weak)] mt-1">
                    {session.messages.length} 条消息
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(session.id, e)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--surface-stronger)] text-[var(--icon-weak)] hover:text-[var(--accent-error)] transition-colors flex-shrink-0"
                  title="删除会话"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
