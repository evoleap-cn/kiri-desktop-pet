import React from 'react'

export function Titlebar() {
  const handleMinimize = () => {
    window.acpAPI.minimizeWindow()
  }

  const handleMaximize = () => {
    window.acpAPI.maximizeWindow()
  }

  const handleClose = () => {
    window.acpAPI.closeWindow()
  }

  return (
    <div
      className="h-10 flex items-center justify-between px-4 bg-[var(--background-surface)] border-b border-[var(--border-base)]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="text-14-medium text-[var(--text-base)]">ACP 对话</div>
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--surface-strong)] transition-colors"
          title="最小化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--surface-strong)] transition-colors"
          title="最大化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--accent-error)] transition-colors"
          title="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
