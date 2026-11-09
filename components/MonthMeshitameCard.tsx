'use client'

// 「◯月のメシため」カード（docs/v2-spec.md 13.3）。計算は lib/calories.ts で済ませた値を受け取って出すだけ

import { useState } from 'react'
import { getGaugeCheatName } from '@/lib/calories'
import {
  EXERCISE_EMOJI,
  EXERCISE_LABEL,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  type EarnedBreakdown,
  type GaugeMarker,
  type ZeroCalStatus,
} from '@/types'

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

export function MonthMeshitameCard({
  month,
  status,
  markers,
  headline,
  earned,
  weightLine,
  onAddExercise,
  onAddCheat,
}: {
  month: number
  status: ZeroCalStatus
  markers: GaugeMarker[]
  headline: string
  earned: EarnedBreakdown
  weightLine: string | null // 「これだけ食べて、月初めから0.4kg減」。条件が揃わないときは null
  onAddExercise: () => void
  onAddCheat: () => void
}) {
  const [open, setOpen] = useState(false)
  const hasCheats = status.entries.length > 0
  const fillRatio = status.totalPt > 0 ? Math.min(1, status.earnedPt / status.totalPt) : 0

  return (
    <div className="bg-stone-900 rounded-2xl px-4 pt-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-300">{month}月のメシため</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddExercise}
            className="bg-stone-800 text-amber-400 font-bold text-xs px-3 py-1.5 rounded-full"
          >
            ＋{EXERCISE_LABEL}
          </button>
          <button
            type="button"
            onClick={onAddCheat}
            className="bg-amber-400 text-stone-950 font-bold text-xs px-3 py-1.5 rounded-full"
          >
            ＋チート
          </button>
        </div>
      </div>

      {!hasCheats ? (
        <button type="button" onClick={onAddCheat} className="w-full text-left">
          <p className="text-amber-400 text-sm font-bold mb-1">{headline}</p>
          <p className="text-stone-500 text-xs">食べたいものを決めると、メシためで0kcalにしていけます</p>
          {weightLine && <p className="text-stone-300 text-xs mt-3">{weightLine}</p>}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full text-left">
          <p className={`text-sm font-bold mb-4 ${status.zeroedCount > 0 ? 'text-amber-400' : 'text-stone-200'}`}>
            {headline}
          </p>

          {/* ゲージ：横棒の上に、各チートの絵文字を累計コストの位置に置く */}
          <div className="px-3">
            <div className="relative h-7">
              {markers.map((m, i) => (
                <span
                  key={i}
                  className={`absolute bottom-0 -translate-x-1/2 flex items-center rounded-full px-1 text-sm leading-6 ${
                    m.zeroed ? 'bg-amber-400/20 ring-1 ring-amber-400' : 'bg-stone-800 grayscale opacity-60'
                  }`}
                  style={{ left: `${m.ratio * 100}%` }}
                >
                  {m.emoji}
                  {m.count > 1 && (
                    <span className={`text-[10px] ml-0.5 ${m.zeroed ? 'text-amber-400' : 'text-stone-400'}`}>
                      ×{m.count}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="relative h-3 bg-stone-800 rounded-full mt-1 mb-3">
              <div
                className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
                style={{ width: `${fillRatio * 100}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-stone-400">
            ゼロカロ化 <span className="text-amber-400 font-bold">{status.zeroedPt}</span> / {status.totalPt}kcal
            {status.next ? (
              <span className="block text-stone-500 mt-0.5">
                ・あと{MEAL_CHOICE_LABELS.light}
                {status.next.tamemeshiNeeded}回で{getGaugeCheatName(status.next.entry)}も0kcal
              </span>
            ) : (
              status.extraPt > 0 && (
                <span className="block text-amber-400 mt-0.5">あと{status.extraPt}kcal分、チートを追加できます</span>
              )
            )}
          </p>

          {weightLine && <p className="text-stone-300 text-xs mt-3">{weightLine}</p>}

          {open ? (
            <div className="mt-4 pt-3 border-t border-stone-800 text-xs space-y-3">
              <div className="text-stone-300 space-y-0.5">
                <p>
                  {MEAL_CHOICE_EMOJI.light} {MEAL_CHOICE_LABELS.light}
                  {earned.tamemeshiCount}回 +{earned.tamemeshiPt}pt
                </p>
                <p>
                  {EXERCISE_EMOJI} {EXERCISE_LABEL} +{earned.exercisePt}pt
                </p>
              </div>
              <ul className="space-y-1">
                {status.entries.map(({ entry, zeroed }, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="min-w-0 truncate text-stone-300">
                      {entry.mode === 'dated' && <span className="text-stone-500 mr-1.5">{shortDate(entry.date)}</span>}
                      {entry.mode === 'frequency' && (
                        <span className="text-stone-500 mr-1.5">
                          週{entry.timesPerWeek}回（今月{entry.timesInMonth}回分）
                        </span>
                      )}
                      {getGaugeCheatName(entry)}
                    </span>
                    <span className="shrink-0 ml-2">
                      <span className="text-stone-500">{entry.costPt}pt</span>
                      {zeroed && <span className="text-amber-400 ml-1.5">0kcal</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-stone-600">閉じる</p>
            </div>
          ) : (
            <p className="text-stone-600 text-[11px] mt-3">タップで内訳</p>
          )}
        </button>
      )}
    </div>
  )
}
