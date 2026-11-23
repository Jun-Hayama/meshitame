'use client'

// 「◯月のチート」カード（docs/v2-spec.md 16章・16-追記 v2.6.2〜v2.6.4）。計算は lib/calories.ts の関数で済ませて出すだけ
// 1本の棒（全体 = チートと貯めた分の大きいほう）。カード全体を押すとログ（/log）へ。中のボタンはボタンの動きを優先する

import type { ReactNode } from 'react'
import {
  CHEAT_BAR_EXACT_LINE,
  CHEAT_CARD_INTRO,
  buildCheatHints,
  calcCheatCardBar,
  describeCardClearedLine,
  describeCardWayLine,
  describeCheatHeadline,
  describePlannedLine,
  describeShortLabel,
  pickCheatEquivalent,
} from '@/lib/calories'
import { EXERCISE_EMOJI, MEAL_CHOICE_EMOJI, type CheatHints, type MonthCheatStatus } from '@/types'

const kcal = (n: number) => `${n.toLocaleString('ja-JP')}kcal`
const pct = (r: number) => `${r * 100}%`

// 足りない部分：斜線の amber ＋ 濃い縁取り
const SHORT_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgb(251 191 36 / 0.55) 0 3px, rgb(251 191 36 / 0.15) 3px 6px)',
}

// 中のボタン：カード全体の「ログへ」より、ボタンの動きを優先する
function InnerButton({ onClick, className, children }: { onClick: () => void; className: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={className}
    >
      {children}
    </button>
  )
}

export function MonthMeshitameCard({
  month,
  status,
  monthWeightDiffKg,
  onOpenLog,
  onRecordWalk,
  onOpenHints,
}: {
  month: number
  status: MonthCheatStatus
  monthWeightDiffKg: number | null // 月初めからの体重の変化（13.4）。計算できないときは null
  onOpenLog: () => void
  onRecordWalk: (minutes: number) => void // うごための画面をウォーキング・その分数で開く
  onOpenHints: (hints: CheatHints) => void
}) {
  const plan = status.planned[0] ?? null
  const bar = calcCheatCardBar(status.eatenKcal, status.savedKcal)
  const headline = describeCheatHeadline(pickCheatEquivalent(status), monthWeightDiffKg)
  const wayLine = describeCardWayLine(status.pendingKcal)
  const hints = buildCheatHints(status.pendingKcal)
  const clearedLine = describeCardClearedLine(status)
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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-300">{month}月のチート</h2>
        <span aria-hidden className="text-stone-600 text-sm leading-none">
          ›
        </span>
      </div>
      {headline && <p className="text-stone-300 text-xs mt-1">{headline}</p>}

      {bar ? (
        <div className="mt-3 mb-3">
          <p className="flex justify-between text-sm mb-1.5">
            <span className="text-stone-400 text-xs">チート</span>
            <span className="text-stone-200">{kcal(status.eatenKcal)}</span>
          </p>
          <div className="relative">
            <div className="relative h-3 bg-stone-800 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-amber-400 transition-all" style={{ width: pct(bar.filled) }} />
              {bar.short > 0 && (
                <div
                  className="absolute inset-y-0 right-0 ring-1 ring-inset ring-amber-400 rounded-r-full"
                  style={{ ...SHORT_STYLE, width: pct(bar.short) }}
                />
              )}
              {bar.over > 0 && <div className="absolute inset-y-0 right-0 bg-amber-200/60" style={{ width: pct(bar.over) }} />}
            </div>
            {bar.markerAt !== null && (
              <div
                aria-hidden
                className="absolute -top-1 -bottom-1 w-0.5 bg-stone-100 rounded-full"
                style={{ left: bar.markerAt >= 1 ? 'calc(100% - 2px)' : pct(bar.markerAt) }}
              />
            )}
          </div>
          <div className="flex items-baseline gap-2 text-sm mt-1.5">
            <span className="text-stone-400 text-xs">貯めた</span>
            <span className="flex-1 min-w-0 truncate">
              {tamemeshiCount > 0 && (
                <span className="mr-2">
                  {MEAL_CHOICE_EMOJI.light}
                  <span className="text-stone-300 text-xs">{tamemeshiCount}回</span>
                </span>
              )}
              {exerciseCount > 0 && (
                <span className="mr-2">
                  {EXERCISE_EMOJI}
                  <span className="text-stone-300 text-xs">{exerciseCount}回</span>
                </span>
              )}
              {status.savedKcal === 0 && <span className="text-stone-500 text-xs">まだありません</span>}
            </span>
            <span className="text-stone-200 shrink-0">{kcal(status.savedKcal)}</span>
            {bar.kind === 'short' && (
              <span className="text-amber-400 text-xs font-bold shrink-0">{describeShortLabel(status.pendingKcal)}</span>
            )}
          </div>
          {bar.kind === 'exact' && <p className="text-amber-400 text-sm font-bold mt-3">{CHEAT_BAR_EXACT_LINE}</p>}
        </div>
      ) : (
        <p className="text-stone-300 text-sm mt-3">{CHEAT_CARD_INTRO}</p>
      )}

      {/* 一番下の行（16-追記 v2.6.3）：「🚶 30分歩けば、なかったことに［記録する］ヒント ›」／「どうやって届く？ ヒント ›」 */}
      {status.stage === 'pending' && wayLine && (
        <div className="flex items-center gap-2">
          <p className={`flex-1 min-w-0 text-sm ${wayLine.walkMinutes === null ? 'text-amber-400 font-bold' : 'text-stone-300'}`}>
            {wayLine.text}
          </p>
          {wayLine.walkMinutes !== null && (
            <InnerButton
              onClick={() => onRecordWalk(wayLine.walkMinutes as number)}
              className="shrink-0 bg-amber-400 text-stone-950 font-bold text-xs px-3 py-1.5 rounded-xl"
            >
              記録する
            </InnerButton>
          )}
          {hints && (
            <InnerButton
              onClick={() => onOpenHints(hints)}
              className={`shrink-0 text-xs py-1 ${wayLine.walkMinutes === null ? 'text-amber-400 font-bold' : 'text-stone-500'}`}
            >
              ヒント ›
            </InnerButton>
          )}
        </div>
      )}

      {/* 貯めた分がチートより多い（16-追記 v2.6.4）：「ぜんぶ、なかったことに。」だけ。食べることはすすめない */}
      {clearedLine && <p className="text-amber-400 text-sm font-bold">{clearedLine}</p>}

      {plan && (
        <p className={`text-xs mt-3 pt-3 border-t border-stone-800 ${plan.ready ? 'text-amber-400' : 'text-stone-400'}`}>
          {describePlannedLine(plan)}
        </p>
      )}
    </div>
  )
}
