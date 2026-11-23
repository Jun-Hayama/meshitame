'use client'

// 今日の記録の「うごき」（16-追記 v2.6.3）。いつものうごため2つは押すとすぐ保存、［＋うごため］はうごための画面
// どのうごためを出すかは pickFrequentExercises、保存は呼び出し側（今日の画面）で行う。kcal は calcExercisePoints から出す

import { calcExercisePoints } from '@/lib/calories'
import { EXERCISE_LABEL, EXERCISE_TYPE_EMOJI, type QuickExercise } from '@/types'

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
      <h3 className="text-xs font-medium text-stone-500 mb-2">うごき</h3>
      {summary && (
        <p className="text-stone-400 text-xs mb-2">
          {isToday ? '今日は' : 'この日は'} {summary}
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto">
        {exercises.map((ex) => (
          <button
            key={`${ex.type}:${ex.minutes}`}
            type="button"
            disabled={saving}
            onClick={() => onQuick(ex)}
            className={chip}
          >
            {EXERCISE_TYPE_EMOJI[ex.type]} {ex.minutes}分{' '}
            <span className="text-stone-400 font-normal">
              {calcExercisePoints({ type: ex.type, minutes: ex.minutes }).toLocaleString('ja-JP')}kcal
            </span>
          </button>
        ))}
        <button type="button" onClick={onMore} className={chip}>
          ＋{EXERCISE_LABEL}
        </button>
      </div>
    </div>
  )
}
