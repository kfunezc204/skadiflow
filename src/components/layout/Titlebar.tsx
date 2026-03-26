import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'

export default function Titlebar() {
  const win = getCurrentWindow()

  return (
    <div
      className="flex h-9 items-center justify-between bg-[#0D0D0D] border-b border-[#2A2A2A] flex-shrink-0"
      data-tauri-drag-region
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-4 select-none"
        data-tauri-drag-region
      >
        <div
          className="w-2 h-2 rounded-full bg-orange-500"
          data-tauri-drag-region
        />
        <span
          className="text-xs font-bold tracking-[0.2em] text-white/90 uppercase"
          data-tauri-drag-region
        >
          skadiflow{' '}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Window controls */}
      <div className="flex items-center">
        <button
          onClick={() => win.minimize()}
          className="flex h-9 w-12 items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          className="flex h-9 w-12 items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Maximize"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => win.close()}
          className="flex h-9 w-12 items-center justify-center text-white/50 hover:text-white hover:bg-red-500 transition-colors"
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
