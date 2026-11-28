'use client'

// 今日の記録の「うごため」（16-追記 v2.6.3〜v2.6.5・18-追記 v2.8.1）。🚶🏃💪⚽ の4つは押すとすぐ保存、［＋］はうごための画面
// 4つの時間は設定画面の「うごための時間」（buildQuickExercises）、保存は呼び出し側（今日の画面）で行う
// ボタンは「アイコン＋時間」だけ。種類名と kcal は出さない（kcal はトーストで伝える）

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
  exercises: QuickExercise[] // 🚶🏃💪⚽ の4つ
  saving: boolean
  onQuick: (exercise: QuickExercise) => void
  onMore: () => void
}) {
  const button = 'min-w-0 whitespace-nowrap rounded-xl py-2.5 font-bold disabled:opacity-50'

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
        <div className="grid grid-cols-5 gap-1.5">
          {exercises.map((ex) => (
            <button
              key={ex.type}
              type="button"
              disabled={saving}
              onClick={() => onQuick(ex)}
              aria-label={`${EXERCISE_TYPE_LABELS[ex.type]} ${ex.minutes}分を記録`}
              // 「🚶120分」のように3桁のときは、入りきるように文字を少し小さくする
              className={`${button} bg-stone-800 text-amber-400 ${ex.minutes >= 100 ? 'text-[11px] tracking-tighter' : 'text-xs'}`}
            >
              {EXERCISE_TYPE_EMOJI[ex.type]}
              {ex.minutes}分
            </button>
          ))}
          <button
            type="button"
            onClick={onMore}
            aria-label={`ほかの${EXERCISE_LABEL}`}
            className={`${button} border border-stone-600 text-stone-300 text-sm`}
          >
            ＋
          </button>
        </div>
      </div>
    </div>
  )
}
