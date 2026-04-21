import React, { useState, useRef, useEffect } from 'react'
import { useSession } from '../context/SessionContext'

export function PromptInput() {
  const { sendMessage, isLoading } = useSession()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return

    const message = input.trim()
    setInput('')
    await sendMessage(message)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-[var(--border-base)] bg-[var(--background-surface)] p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              disabled={isLoading}
              className="w-full px-4 py-3 bg-[var(--surface-base)] border border-[var(--border-base)] rounded-lg resize-none focus:outline-none focus:border-[var(--accent-primary)] text-14-regular text-[var(--text-base)] placeholder:text-[var(--text-weak)] disabled:opacity-50"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="h-12 px-6 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-opacity text-14-medium flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                发送中
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2 8l12-6-6 12-2-6-4-0z"
                    fill="currentColor"
                  />
                </svg>
                发送
              </>
            )}
          </button>
        </div>
        <div className="mt-2 text-11-regular text-[var(--text-weak)]">
          提示：Enter 发送，Shift+Enter 换行
        </div>
      </div>
    </div>
  )
}
