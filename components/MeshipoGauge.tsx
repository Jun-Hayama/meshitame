'use client'

// メシポゲージ（docs/v2-spec.md 10-4・12-4）。計算は lib/calories.ts で済ませた値を受け取って出すだけ

import { useState } from 'react'
import {
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  type EarnedBreakdown,
  type GaugeCheatEntry,
  type MealSlot,
  type MeshipoGauge as Gauge,
} from '@/types'

const SLOT_LABELS: Record<MealSlot, string> = { morning: '朝', lunch: '昼', dinner: '夜' }

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

// 「🔥がっつり（11/9 夜）」
export function heartyCheatLabel(date: string, slot: MealSlot): string {
  return `${MEAL_CHOICE_EMOJI.hearty}${MEAL_CHOICE_LABELS.hearty}（${shortDate(date)} ${SLOT_LABELS[slot]}）`
}

export function GaugeCheatList({ entries }: { entries: GaugeCheatEntry[] }) {
  return (
    <ul className="space-y-1.5">
      {entries.map((e) => {
        if (e.mode === 'hearty') {
          return (
            <li key={`hearty:${e.date}:${e.slot}`} className="flex items-center justify-between bg-stone-900 rounded-xl px-3 py-2">
              <span className="text-sm min-w-0 truncate">{heartyCheatLabel(e.date, e.slot)}</span>
              <span className="text-xs shrink-0 ml-2 text-stone-500">{e.costPt}pt</span>
            </li>
          )
        }
        const name = e.row.label || WANT_KIND_LABELS[e.row.kind]
        const done = e.mode === 'dated' && e.done
        return (
          <li
            key={e.row.id}
            className={`flex items-center justify-between bg-stone-900 rounded-xl px-3 py-2 ${done ? 'opacity-50' : ''}`}
          >
            <span className="text-sm min-w-0 truncate">
              <span className="text-stone-500 text-xs mr-2">
                {e.mode === 'dated' ? shortDate(e.date) : `週${e.timesPerWeek}回（今月${e.timesInMonth}回分）`}
              </span>
              {WANT_KIND_EMOJI[e.row.kind]} {name}
            </span>
            <span className="text-xs shrink-0 ml-2">
              {done ? <span className="text-amber-400">★済み</span> : <span className="text-stone-500">{e.costPt}pt</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function MeshipoGauge({
  gauge,
  earned,
  entries,
  weekPt,
  onPlanCheats,
}: {
  gauge: Gauge
  earned: EarnedBreakdown
  entries: GaugeCheatEntry[] // 目標に入るチート（がっつり含む）
  weekPt: number // 今週（月〜日）貯めたpt
  onPlanCheats: () => void // 「今月のチートを決めよう」（チートのタブへ）
}) {
  const [open, setOpen] = useState(false)

  // 今月のチートが0件ならゲージの代わりにボタン
  if (entries.length === 0) {
    return (
      <>
        <button
          type="button"
          onClick={onPlanCheats}
          className="w-full bg-stone-900 rounded-2xl px-4 py-6 text-center mb-2"
        >
          <p className="text-amber-400 text-sm font-bold mb-1">今月のチートを決めよう</p>
          <p className="text-stone-500 text-xs">食べたいものを先に決めると、貯める目標ができます</p>
        </button>
        <WeekPt weekPt={weekPt} />
      </>
    )
  }

  const heartyEntries = entries.filter((e) => e.mode === 'hearty')
  const heartyPt = heartyEntries.reduce((sum, e) => sum + e.costPt, 0)
  const achieved = gauge.earnedPt >= gauge.targetPt

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left bg-stone-900 rounded-2xl px-4 py-4 mb-2"
      >
        <p className="text-sm mb-3 flex items-baseline justify-between">
          <span>
            <span className="text-stone-500 text-xs">貯まった </span>
            <span className="text-amber-400 text-xl font-bold">{gauge.earnedPt}</span>
            <span className="text-stone-400">pt</span>
            <span className="text-stone-600"> ／ </span>
            <span className="text-stone-500 text-xs">目標 </span>
            <span className="text-stone-300">{gauge.targetPt}pt</span>
          </span>
          <span className="text-stone-600 text-xs">{open ? '閉じる' : '内訳'}</span>
        </p>
        <div className="relative h-3 bg-stone-800 rounded-full mb-2">
          <div
            className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
            style={{ width: `${gauge.fillRatio * 100}%` }}
          />
          <div
            className="absolute -top-1 -bottom-1 w-0.5 bg-stone-100"
            style={{ left: `${gauge.paceRatio * 100}%` }}
            aria-label={`ペースの目印 ${gauge.pacePt}pt`}
          />
        </div>
        <p className="text-xs text-stone-400">
          {achieved ? (
            <span className="text-amber-400">
              今月の目標達成！{gauge.extraPt > 0 && `あと${gauge.extraPt}pt分チートを追加できる`}
            </span>
          ) : gauge.onPace ? (
            <span className="text-amber-400">ペースどおり</span>
          ) : (
            <>
              あと{gauge.behindPt}ptでペースに追いつく
              <span className="block text-stone-500 mt-0.5">今日{gauge.catchUpWalkingMinutes}分歩くとペースに追いつく</span>
            </>
          )}
        </p>
        {!achieved && (
          <p className="text-stone-500 text-xs mt-2">
            今月あと{MEAL_CHOICE_EMOJI.light}{MEAL_CHOICE_LABELS.light}{gauge.tamemeshiNeeded}回で目標に届きます
          </p>
        )}

        {open && (
          <div className="mt-4 pt-3 border-t border-stone-800 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-stone-500 mb-1.5">貯まった {gauge.earnedPt}pt</p>
              <p className="text-stone-300">
                {MEAL_CHOICE_EMOJI.light}{MEAL_CHOICE_LABELS.light}{earned.tamemeshiCount}回 +{earned.tamemeshiPt}
              </p>
              <p className="text-stone-300 mt-0.5">🏃運動 +{earned.exercisePt}</p>
            </div>
            <div>
              <p className="text-stone-500 mb-1.5">目標 {gauge.targetPt}pt</p>
              <p className="text-stone-300">★チート {gauge.targetPt - heartyPt}pt</p>
              <p className="text-stone-300 mt-0.5">
                {MEAL_CHOICE_EMOJI.hearty}{MEAL_CHOICE_LABELS.hearty}{heartyEntries.length}回 {heartyPt}pt
              </p>
              <p className="text-stone-600 mt-1">一覧は下に</p>
            </div>
          </div>
        )}
      </button>
      <WeekPt weekPt={weekPt} />
    </>
  )
}

function WeekPt({ weekPt }: { weekPt: number }) {
  return <p className="text-stone-500 text-xs px-1 mb-3">今週 +{weekPt}pt</p>
}
