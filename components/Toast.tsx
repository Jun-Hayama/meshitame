'use client'

import { useEffect } from 'react'

// 画面下に数秒だけ出す一言（13.3「{チート名}、なかったことに。」）
export function Toast({ message, onDone, durationMs = 2500 }: { message: string; onDone: () => void; durationMs?: number }) {
  useEffect(() => {
    const id = setTimeout(onDone, durationMs)
    return () => clearTimeout(id)
  }, [message, onDone, durationMs])

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-5 pointer-events-none">
      <p
        role="status"
        className="max-w-md bg-amber-400 text-stone-950 font-bold text-sm px-4 py-2.5 rounded-full shadow-lg"
      >
        {message}
      </p>
    </div>
  )
}
