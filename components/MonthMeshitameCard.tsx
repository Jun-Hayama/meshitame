'use client'

// 「◯月のチート」カード（docs/v2-spec.md 16章）。計算は lib/calories.ts で済ませた値を受け取って出すだけ
// カード全体を押すとログ（/log）へ。B のときだけ「今日食べる」「予定に入れる」を出す

import {
  CHEAT_CARD_INTRO,
  CHEAT_CARD_ON_TRACK,
  buildPendingEmojis,
  calcClearedRatio,
  describePendingLine,
  describePlannedLine,
  describeSpareLine,
  hasMonthCheats,
  hasPendingCarryover,
} from '@/lib/calories'
import type { MonthCheatStatus } from '@/types'

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
  onEatToday: () => void // 今日の「食事のほかに」の追加画面
  onPlan: () => void // チートのタブの追加画面
}) {
  const plan = status.planned[0] ?? null
  const emojis = buildPendingEmojis(status)

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

      {status.stage === 'pending' && (
        <>
          <p className="text-base leading-6">
            {hasPendingCarryover(status) && <span className="text-stone-400 text-xs mr-2">先月の分</span>}
            {emojis.map((g, i) => (
              <span key={i} className="mr-2">
                {g.emoji}
                <span className="text-stone-400 text-xs">×{g.count}</span>
              </span>
            ))}
          </p>
          <div className="relative h-3 bg-stone-800 rounded-full mt-2 mb-3">
            <div
              className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
              style={{ width: `${calcClearedRatio(status) * 100}%` }}
            />
          </div>
          <p className="text-amber-400 text-sm font-bold">{describePendingLine(status)}</p>
        </>
      )}

      {status.stage === 'spare' && (
        <>
          {hasMonthCheats(status) && <p className="text-stone-300 text-xs mb-1">{CHEAT_CARD_ON_TRACK}</p>}
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

      {status.stage === 'empty' && <p className="text-stone-300 text-sm">{CHEAT_CARD_INTRO}</p>}

      {plan && (
        <p className={`text-xs mt-3 pt-3 border-t border-stone-800 ${plan.ready ? 'text-amber-400' : 'text-stone-400'}`}>
          {describePlannedLine(plan)}
        </p>
      )}
    </div>
  )
}
