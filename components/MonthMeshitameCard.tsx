'use client'

// 「◯月のチート」カード（docs/v2-spec.md 16章）。計算は lib/calories.ts で済ませた値を受け取って出すだけ
// カード全体を押すとログ（/log）へ。B のときだけ「今日食べる」「予定に入れる」を出す
// v2.6.1：「食べた」「貯めた」の2本の棒を同じ目盛りで出す（両方0のときは棒なし）

import {
  CHEAT_CARD_INTRO,
  CHEAT_CARD_ON_TRACK,
  buildEatenEmojis,
  calcCheatCardBars,
  describePendingLine,
  describePlannedLine,
  describeSpareLine,
} from '@/lib/calories'
import { EXERCISE_EMOJI, MEAL_CHOICE_EMOJI, type MonthCheatStatus } from '@/types'
import type { ReactNode } from 'react'

const kcal = (n: number) => `${n.toLocaleString('ja-JP')}kcal`

// 絵文字と回数（「🐷×5」）
function Count({ emoji, count }: { emoji: string; count: number }) {
  return (
    <span className="mr-2">
      {emoji}
      <span className="text-stone-400 text-xs">×{count}</span>
    </span>
  )
}

// 「食べた」「貯めた」の1行：見出し・中身、その下に棒と kcal
function BarRow({ label, children, kcalValue, bar }: { label: string; children: ReactNode; kcalValue: number; bar: ReactNode }) {
  return (
    <div>
      <p className="text-sm leading-6">
        <span className="text-stone-400 text-xs mr-2">{label}</span>
        {children}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <div className="relative h-3 flex-1 bg-stone-800 rounded-full overflow-hidden">{bar}</div>
        <span className="text-stone-300 text-xs w-20 text-right shrink-0">{kcal(kcalValue)}</span>
      </div>
    </div>
  )
}

export function MonthMeshitameCard({
  month,
  status,
  onOpenLog,
  onEatToday,
  onPlan,
}: {
  month: number
  status: MonthCheatStatus
  onOpenLog: () => void
  onEatToday: () => void // 今日の「追加チート」の追加画面
  onPlan: () => void // チートのタブの追加画面
}) {
  const plan = status.planned[0] ?? null
  const bars = calcCheatCardBars(status)
  const emojis = buildEatenEmojis(status)
  const { tamemeshiCount, exerciseCount } = status.earned

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpenLog}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpenLog()
      }}
      className="bg-stone-900 rounded-2xl px-4 py-4 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-300">{month}月のチート</h2>
        <span aria-hidden className="text-stone-600 text-sm leading-none">
          ›
        </span>
      </div>

      {bars && (
        <div className="flex flex-col gap-3 mb-3">
          <BarRow
            label="食べた"
            kcalValue={status.eatenKcal}
            bar={
              <>
                <div className="absolute inset-y-0 left-0 bg-amber-400/30 rounded-full transition-all" style={{ width: `${bars.eaten * 100}%` }} />
                <div className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all" style={{ width: `${bars.cleared * 100}%` }} />
              </>
            }
          >
            {status.carryoverKcal > 0 && <span className="text-stone-400 text-xs mr-2">先月の分</span>}
            {emojis.map((g, i) => (
              <Count key={i} emoji={g.emoji} count={g.count} />
            ))}
            {status.eatenKcal === 0 && <span className="text-stone-500 text-xs">まだありません</span>}
          </BarRow>
          <BarRow
            label="貯めた"
            kcalValue={status.savedKcal}
            bar={<div className="absolute inset-y-0 left-0 bg-stone-300 rounded-full transition-all" style={{ width: `${bars.saved * 100}%` }} />}
          >
            {tamemeshiCount > 0 && <Count emoji={MEAL_CHOICE_EMOJI.light} count={tamemeshiCount} />}
            {exerciseCount > 0 && <Count emoji={EXERCISE_EMOJI} count={exerciseCount} />}
            {status.savedKcal === 0 && <span className="text-stone-500 text-xs">まだありません</span>}
          </BarRow>
        </div>
      )}

      {status.stage === 'pending' && <p className="text-amber-400 text-sm font-bold">{describePendingLine(status)}</p>}

      {status.stage === 'spare' && (
        <>
          {status.eatenKcal >= 1 && <p className="text-stone-300 text-xs mb-1">{CHEAT_CARD_ON_TRACK}</p>}
          <p className="text-amber-400 text-sm font-bold">{describeSpareLine(status)}</p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEatToday()
              }}
              className="flex-1 bg-amber-400 text-stone-950 font-bold text-xs py-2 rounded-xl"
            >
              今日食べる
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPlan()
              }}
              className="flex-1 bg-stone-800 text-amber-400 font-bold text-xs py-2 rounded-xl"
            >
              予定に入れる
            </button>
          </div>
        </>
      )}

      {status.stage === 'empty' &&
        (bars ? (
          // 食べた分と貯めた分がちょうど同じ
          <p className="text-stone-300 text-xs">{CHEAT_CARD_ON_TRACK}</p>
        ) : (
          <p className="text-stone-300 text-sm">{CHEAT_CARD_INTRO}</p>
        ))}

      {plan && (
        <p className={`text-xs mt-3 pt-3 border-t border-stone-800 ${plan.ready ? 'text-amber-400' : 'text-stone-400'}`}>
          {describePlannedLine(plan)}
        </p>
      )}
    </div>
  )
}
