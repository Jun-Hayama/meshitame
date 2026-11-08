'use client'

import type { Milestone } from '@/types'

// ゲート達成・3%・5% の一言（11-5）
export function MilestoneCards({ milestones, onDismiss }: { milestones: Milestone[]; onDismiss: (kind: string) => void }) {
  if (milestones.length === 0) return null
  return (
    <div className="space-y-2">
      {milestones.map((m) => (
        <div
          key={m.kind}
          className="flex items-start justify-between gap-3 bg-amber-400/10 border border-amber-400/40 rounded-2xl px-4 py-3"
        >
          <div>
            <p className="text-amber-400 font-bold text-sm">{m.title}</p>
            <p className="text-stone-300 text-xs mt-0.5">{m.message}</p>
          </div>
          <button type="button" onClick={() => onDismiss(m.kind)} className="text-stone-500 text-xs shrink-0">
            閉じる
          </button>
        </div>
      ))}
      {milestones.some((m) => m.kind === 'loss3' || m.kind === 'loss5') && (
        <p className="text-stone-600 text-[11px] px-1">持病がある人や気になる人は、医師に相談してね</p>
      )}
    </div>
  )
}
