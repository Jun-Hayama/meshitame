'use client'

// 今日の記録の「うごため」（16-追記 v2.6.3〜v2.6.5）。いつものうごため2つは押すとすぐ保存、［＋ ほかのうごため］はうごための画面
// どのうごためを出すかは pickFrequentExercises、保存は呼び出し側（今日の画面）で行う。ボタンに kcal は出さない（トーストで伝える）

import { EXERCISE_SECTION_NOTE } from '@/lib/calorieConstants'
import { EXERCISE_EMOJI, EXERCISE_LABEL, EXERCISE_TYPE_EMOJI, EXERCISE_TYPE_LABELS, type QuickExercise } from '@/types'

export function QuickExerciseRow({
  isToday,
  summary,
  exercises,
  saving,
  onQuick,
  onMore,
}: {
  isToday: boolean
  summary: string | null // 「🚶30分・👣8,000歩」
  exercises: QuickExercise[] // いつものうごため
  saving: boolean
  onQuick: (exercise: QuickExercise) => void
  onMore: () => void
}) {
  const chip = 'shrink-0 bg-stone-800 text-amber-400 font-bold text-xs px-3 py-2 rounded-full disabled:opacity-50'

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xs font-medium text-stone-500">
          {EXERCISE_EMOJI} {EXERCISE_LABEL}
        </h3>
        <p className="text-[11px] text-stone-600">{EXERCISE_SECTION_NOTE}</p>
      </div>
      {/* 朝・昼・夜や追加チートの行と同じ枠（16-追記 v2.6.5） */}
      <div className="bg-stone-900 rounded-2xl px-4 py-3">
        {summary && (
          <p className="text-stone-400 text-xs mb-2">
            {isToday ? '今日は' : 'この日は'} {summary}
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto">
          {exercises.map((ex) => (
            <button
              key={ex.type}
              type="button"
              disabled={saving}
              onClick={() => onQuick(ex)}
              className={chip}
            >
              {EXERCISE_TYPE_EMOJI[ex.type]} {EXERCISE_TYPE_LABELS[ex.type]} {ex.minutes}分
            </button>
          ))}
          <button type="button" onClick={onMore} className={chip}>
            ＋ ほかの{EXERCISE_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
