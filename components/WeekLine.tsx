'use client'

// 今週の行（docs/v2-spec.md 13.5）。「今週 +◯pt」の1行、タップで内訳。日曜・月曜は振り返り文に置き換える

import { useState } from 'react'
import { getGaugeCheatName } from '@/lib/calories'
import {
  EXERCISE_EMOJI,
  EXERCISE_LABEL,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  WANT_KIND_LABELS,
  type WeekSummary,
} from '@/types'

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

export function WeekLine({ summary, label }: { summary: WeekSummary; label: string }) {
  const [open, setOpen] = useState(false)
  const { earned, cheats, frequencyCheats } = summary
  const cheatCount = cheats.length + frequencyCheats.length

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="w-full text-left px-1 mt-2"
    >
      <p className="text-stone-400 text-xs flex justify-between">
        <span>{label}</span>
        <span className="text-stone-600 shrink-0 ml-2">{open ? '▴' : '▾'}</span>
      </p>
      {open && (
        <div className="mt-1.5 text-xs text-stone-300 space-y-1">
          <p className="text-stone-500">
            {shortDate(summary.from)}〜{shortDate(summary.to)}
          </p>
          <p>
            {MEAL_CHOICE_EMOJI.light}
            {MEAL_CHOICE_LABELS.light}
            {earned.tamemeshiCount}回 +{earned.tamemeshiPt}pt
            <span className="text-stone-600"> ・ </span>
            {EXERCISE_EMOJI}
            {EXERCISE_LABEL} +{earned.exercisePt}pt
          </p>
          {cheatCount > 0 ? (
            <div>
              <p className="text-stone-400">今週食べたチート</p>
              <ul className="mt-0.5 space-y-0.5">
                {cheats.map((e, i) => (
                  <li key={i}>
                    {e.mode === 'dated' && <span className="text-stone-500 mr-1.5">{shortDate(e.date)}</span>}
                    {getGaugeCheatName(e)}
                  </li>
                ))}
                {frequencyCheats.map((e) => (
                  <li key={e.row.id}>
                    <span className="text-stone-500 mr-1.5">週{e.timesPerWeek}回</span>
                    {e.row.label || WANT_KIND_LABELS[e.row.kind]}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-stone-400">今週のチートはまだ。食べたいものを決めておこう</p>
          )}
        </div>
      )}
    </button>
  )
}
