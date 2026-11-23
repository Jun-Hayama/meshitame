'use client'

import { useEffect } from 'react'

// 画面下に数秒だけ出す一言（13.3「{チート名}、なかったことに。」）
// action を渡すと、右に操作ボタン（「取り消す」など）を出す（16-追記 v2.6.2）
export function Toast({
  message,
  onDone,
  durationMs = 2500,
  action,
}: {
  message: string
  onDone: () => void
  durationMs?: number
  action?: { label: string; onClick: () => void }
}) {
  useEffect(() => {
    const id = setTimeout(onDone, durationMs)
    return () => clearTimeout(id)
  }, [message, onDone, durationMs])

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-5 pointer-events-none">
      <p
        role="status"
        className="max-w-md bg-amber-400 text-stone-950 font-bold text-sm px-4 py-2.5 rounded-full shadow-lg flex items-center gap-3"
      >
        <span>{message}</span>
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick()
              onDone()
            }}
            className="pointer-events-auto shrink-0 bg-stone-950/15 text-stone-950 text-xs px-2.5 py-1 rounded-full"
          >
            {action.label}
          </button>
        )}
      </p>
    </div>
  )
}
