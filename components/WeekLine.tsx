'use client'

// 今週の行（docs/v2-spec.md 16章 6）。ログの先頭に出す。押すと内訳

import { useState } from 'react'
import { getCheatEmoji, getCheatName } from '@/lib/calories'
import { CHEAT_PLACE_LABELS, EXERCISE_EMOJI, EXERCISE_LABEL, MEAL_CHOICE_EMOJI, MEAL_CHOICE_LABELS, type WeekSummary } from '@/types'

const dayLabel = (date: string) => `${Number(date.slice(8, 10))}日`

export function WeekLine({ summary, label }: { summary: WeekSummary; label: string }) {
  const [open, setOpen] = useState(false)
  const { earned, cheats } = summary
  const sameMonth = summary.from.slice(0, 7) === summary.to.slice(0, 7)
  const range = `${dayLabel(summary.from)}〜${sameMonth ? dayLabel(summary.to) : `${Number(summary.to.slice(5, 7))}月${dayLabel(summary.to)}`}`

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="w-full text-left bg-stone-900 rounded-2xl px-4 py-3"
    >
      <p className="text-stone-200 text-sm flex justify-between">
        <span>{label}</span>
        <span className="text-stone-600 shrink-0 ml-2">{open ? '▴' : '▾'}</span>
      </p>
      {open && (
        <div className="mt-2 text-xs text-stone-300 space-y-1.5">
          <p className="text-stone-500">今週（{range}）</p>
          <p>
            {MEAL_CHOICE_EMOJI.light} {MEAL_CHOICE_LABELS.light}
            {earned.tamemeshiCount}回 {earned.tamemeshiPt.toLocaleString('ja-JP')}kcal
            <span className="text-stone-600"> ・ </span>
            {EXERCISE_EMOJI} {EXERCISE_LABEL} {earned.exercisePt.toLocaleString('ja-JP')}kcal
          </p>
          {cheats.length > 0 ? (
            <div>
              <p className="text-stone-400">今週食べたチート {summary.cheatKcal.toLocaleString('ja-JP')}kcal</p>
              <ul className="mt-0.5 space-y-0.5">
                {cheats.map((c) => (
                  <li key={c.key}>
                    <span className="text-stone-500 mr-1.5">
                      {dayLabel(c.date)} {CHEAT_PLACE_LABELS[c.place]}
                    </span>
                    {getCheatEmoji(c)} {c.kind === 'hearty' ? MEAL_CHOICE_LABELS.hearty : getCheatName(c)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-stone-400">今週のチートはまだです</p>
          )}
        </div>
      )}
    </button>
  )
}
