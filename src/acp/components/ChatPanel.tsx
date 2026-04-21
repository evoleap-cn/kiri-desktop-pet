import React, { useEffect, useRef } from 'react'
import { useSession } from '../context/SessionContext'
import { marked } from 'marked'
import type { ChatMessage } from '../types'

export function ChatPanel() {
  const { messages, isLoading } = useSession()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-weak)]">
        <div className="text-14-regular">发送一条消息开始对话</div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 px-4 text-[var(--text-weak)]">
            <div className="w-4 h-4 border-2 border-[var(--icon-weak)] border-t-transparent rounded-full animate-spin" />
            <span className="text-12-regular">思考中...</span>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-4 animate-fade-up`}>
      <div
        className={`max-w-2xl rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-[var(--surface-strong)] text-[var(--text-strong)]'
            : 'bg-transparent text-[var(--text-base)]'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-[var(--avatar-mint)] flex items-center justify-center text-white text-12-medium">
              A
            </div>
            <span className="text-12-medium text-[var(--text-weak)]">Assistant</span>
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap text-14-regular">{message.content}</div>
        ) : (
          <MarkdownContent content={message.content} />
        )}
        <div className="text-11-regular text-[var(--text-weak)] mt-2 text-right">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const html = React.useMemo(() => {
    try {
      return marked.parse(content) as string
    } catch {
      return content
    }
  }, [content])

  return (
    <div
      className="markdown-body text-14-regular"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
