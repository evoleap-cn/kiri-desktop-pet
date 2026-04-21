import React from 'react'

interface HomeProps {
  onNewSession: () => void
}

export function Home({ onNewSession }: HomeProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[var(--background-base)] p-8">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--surface-strong)] flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path
              d="M20 8v24M8 20h24"
              stroke="var(--text-weak)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className="text-18 font-semibold text-[var(--text-base)] mb-3">
          欢迎使用 ACP 对话
        </h2>
        <p className="text-14-regular text-[var(--text-weak)] mb-6">
          开始一个新会话，与 AI 助手进行对话交流
        </p>
        <button
          onClick={onNewSession}
          className="px-6 py-3 bg-[var(--accent-primary)] hover:opacity-90 text-white rounded-lg transition-opacity text-14-medium"
        >
          创建新会话
        </button>
      </div>
    </div>
  )
}
