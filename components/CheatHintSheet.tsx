'use client'

// 「ヒント ›」のシート（16-追記 v2.6.2・18-追記 v2.8.1）。数は lib/calories.ts の buildCheatHints、コツは定数。AIは使わない
// まだの分が300kcal以下なら、見出しの下に「🚶 ◯分歩けば、なかったことに［記録する］」（describeEasyWalkLine）

import { describeEasyWalkLine, formatDurationMinutes, formatSteps } from '@/lib/calories'
import { CHEAT_HINT_TIPS } from '@/lib/calorieConstants'
import { EXERCISE_TYPE_EMOJI, EXERCISE_TYPE_LABELS, MEAL_CHOICE_EMOJI, MEAL_CHOICE_LABELS, type CheatHints } from '@/types'

export function CheatHintSheet({
  hints,
  onClose,
  onRecordWalk,
}: {
  hints: CheatHints
  onClose: () => void
  onRecordWalk: (minutes: number) => void // シートを閉じたあと、うごための画面をウォーキング・その分数で開く
}) {
  const walkLine = describeEasyWalkLine(hints.pendingKcal)
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
        <div className={`flex justify-between items-center ${walkLine ? 'mb-3' : 'mb-4'}`}>
          <h3 className="font-bold">
            あと <span className="text-amber-400">{hints.pendingKcal.toLocaleString('ja-JP')}</span>kcal
          </h3>
          <button type="button" onClick={onClose} className="text-stone-500 text-sm">
            閉じる
          </button>
        </div>
        {walkLine && (
          <div className="flex items-center gap-2 mb-4">
            <p className="flex-1 min-w-0 text-sm text-stone-200">{walkLine.text}</p>
            <button
              type="button"
              onClick={() => {
                onClose()
                onRecordWalk(walkLine.walkMinutes)
              }}
              className="shrink-0 bg-amber-400 text-stone-950 font-bold text-xs px-3 py-1.5 rounded-xl"
            >
              記録する
            </button>
          </div>
        )}
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
