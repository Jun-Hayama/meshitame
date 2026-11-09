'use client'

// 今週の振り返り（docs/v2-spec.md 12-5）。日曜と次の月曜にホームで出す

import { describeWeekEarned, formatWeightChange } from '@/lib/calories'
import { MEAL_CHOICE_EMOJI, MEAL_CHOICE_LABELS, WANT_KIND_EMOJI, WANT_KIND_LABELS, type WeekSummary } from '@/types'
import { heartyCheatLabel } from '@/components/MeshipoGauge'

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

export function WeeklyReviewCard({ summary }: { summary: WeekSummary }) {
  const { earned, cheats, frequencyCheats, weightDiffKg } = summary
  const cheatCount = cheats.length + frequencyCheats.length

  return (
    <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl px-4 py-4">
      <p className="text-stone-400 text-xs mb-1">
        今週の振り返り（{shortDate(summary.from)}〜{shortDate(summary.to)}）
      </p>
      <p className="text-amber-400 text-sm font-bold mb-3">{describeWeekEarned(earned.totalPt)}</p>

      <div className="space-y-1 text-xs text-stone-300">
        <p>
          {MEAL_CHOICE_EMOJI.light}{MEAL_CHOICE_LABELS.light}{earned.tamemeshiCount}回 +{earned.tamemeshiPt}pt
          <span className="text-stone-600"> · </span>
          🏃運動 +{earned.exercisePt}pt
        </p>
        {cheatCount > 0 ? (
          <div>
            <p className="text-stone-400">今週楽しんだチート {summary.cheatPt}pt</p>
            <ul className="mt-0.5 space-y-0.5 text-stone-300">
              {cheats.map((e) =>
                e.mode === 'hearty' ? (
                  <li key={`hearty:${e.date}:${e.slot}`}>{heartyCheatLabel(e.date, e.slot)}</li>
                ) : (
                  <li key={e.row.id}>
                    ★{shortDate(e.date)} {WANT_KIND_EMOJI[e.row.kind]}
                    {e.row.label || WANT_KIND_LABELS[e.row.kind]}
                  </li>
                )
              )}
              {frequencyCheats.map((e) => (
                <li key={e.row.id}>
                  ★週{e.timesPerWeek}回 {WANT_KIND_EMOJI[e.row.kind]}
                  {e.row.label || WANT_KIND_LABELS[e.row.kind]}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-stone-400">今週のチートはなし。来週の楽しみを決めておこう</p>
        )}
        {weightDiffKg !== null && (
          <p>
            ⚖️ 7日平均 前の週から {formatWeightChange(weightDiffKg)}
            {weightDiffKg > 0.05 && <span className="text-stone-500">（水分などで動く範囲です）</span>}
          </p>
        )}
      </div>
    </div>
  )
}
