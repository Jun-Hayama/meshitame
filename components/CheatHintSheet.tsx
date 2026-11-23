'use client'

// 「ヒント ›」のシート（16-追記 v2.6.2）。数は lib/calories.ts の buildCheatHints、コツは定数。AIは使わない

import { formatDurationMinutes, formatSteps } from '@/lib/calories'
import { CHEAT_HINT_TIPS } from '@/lib/calorieConstants'
import { EXERCISE_TYPE_EMOJI, EXERCISE_TYPE_LABELS, MEAL_CHOICE_EMOJI, MEAL_CHOICE_LABELS, type CheatHints } from '@/types'

export function CheatHintSheet({ hints, onClose }: { hints: CheatHints; onClose: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: `${MEAL_CHOICE_EMOJI.light} ${MEAL_CHOICE_LABELS.light}`, value: `${hints.tamemeshiCount}回` },
    {
      label: `${EXERCISE_TYPE_EMOJI.walking} ${EXERCISE_TYPE_LABELS.walking}`,
      value:
        formatDurationMinutes(hints.walkingMinutes) +
        (hints.walkingMinutes > 30 ? `（30分なら${hints.walking30Count}回）` : ''),
    },
    { label: `${EXERCISE_TYPE_EMOJI.running} ${EXERCISE_TYPE_LABELS.running}`, value: formatDurationMinutes(hints.runningMinutes) },
    { label: `${EXERCISE_TYPE_EMOJI.steps} ${EXERCISE_TYPE_LABELS.steps}`, value: formatSteps(hints.steps) },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">
            あと <span className="text-amber-400">{hints.pendingKcal.toLocaleString('ja-JP')}</span>kcal
          </h3>
          <button type="button" onClick={onClose} className="text-stone-500 text-sm">
            閉じる
          </button>
        </div>
        <ul className="bg-stone-800 rounded-2xl px-4 py-1 mb-5">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between py-2.5 text-sm border-b border-stone-700/60 last:border-b-0">
              <span>{r.label}</span>
              <span className="text-stone-300">{r.value}</span>
            </li>
          ))}
        </ul>
        <p className="text-stone-400 text-xs mb-2">ちょっとしたコツ</p>
        <ul className="space-y-1.5 text-sm text-stone-300">
          {CHEAT_HINT_TIPS.map((tip) => (
            <li key={tip}>・{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
