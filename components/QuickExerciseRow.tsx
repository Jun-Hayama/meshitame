'use client'

// 「今日うごく？」の行（16-追記 v2.6.2）。［🚶30分］［🏃30分］は押すとすぐ保存、［👣歩数］は小さな入力、［…］はうごための画面
// 保存は呼び出し側（今日の画面）で行う。kcal は calcExercisePoints から出す

import { useState } from 'react'
import { calcExercisePoints } from '@/lib/calories'
import { QUICK_EXERCISE_MINUTES } from '@/lib/calorieConstants'
import { EXERCISE_TYPE_EMOJI } from '@/types'

const QUICK_TYPES = ['walking', 'running'] as const

export function QuickExerciseRow({
  isToday,
  summary,
  saving,
  onQuick,
  onSteps,
  onMore,
}: {
  isToday: boolean
  summary: string | null // 「🚶30分・👣8,000歩」
  saving: boolean
  onQuick: (type: (typeof QUICK_TYPES)[number], minutes: number) => void
  onSteps: (steps: number) => void
  onMore: () => void
}) {
  const [stepsOpen, setStepsOpen] = useState(false)
  const [steps, setSteps] = useState('')
  const stepsValue = Number(steps) || 0

  const chip = 'shrink-0 bg-stone-800 text-amber-400 font-bold text-xs px-3 py-2 rounded-full disabled:opacity-50'

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-stone-300 mb-1">{isToday ? '今日うごく？' : 'この日うごいた？'}</h2>
      {summary && (
        <p className="text-stone-400 text-xs mb-2">
          {isToday ? '今日は' : 'この日は'} {summary}
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto mt-2">
        {QUICK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={saving}
            onClick={() => onQuick(type, QUICK_EXERCISE_MINUTES)}
            className={chip}
          >
            {EXERCISE_TYPE_EMOJI[type]}
            {QUICK_EXERCISE_MINUTES}分{' '}
            <span className="text-stone-400 font-normal">
              {calcExercisePoints({ type, minutes: QUICK_EXERCISE_MINUTES }).toLocaleString('ja-JP')}kcal
            </span>
          </button>
        ))}
        <button type="button" disabled={saving} onClick={() => setStepsOpen((v) => !v)} className={chip}>
          {EXERCISE_TYPE_EMOJI.steps}歩数
        </button>
        <button type="button" onClick={onMore} aria-label="うごためを種類と時間で記録する" className={chip}>
          …
        </button>
      </div>
      {stepsOpen && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="8000"
            aria-label="歩数"
            className="w-32 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-sm"
          />
          <span className="text-stone-500 text-xs">歩</span>
          <button
            type="button"
            disabled={saving || stepsValue <= 0}
            onClick={() => {
              onSteps(stepsValue)
              setSteps('')
              setStepsOpen(false)
            }}
            className="ml-auto bg-amber-400 text-stone-950 font-bold text-xs px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {stepsValue > 0 ? `${calcExercisePoints({ type: 'steps', steps: stepsValue }).toLocaleString('ja-JP')}kcal 記録する` : '記録する'}
          </button>
        </div>
      )}
    </section>
  )
}
