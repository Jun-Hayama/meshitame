'use client'

import type { WeightChartData, WeightChartPoint } from '@/types'
import { daysBetween } from '@/lib/calories'

// 進捗チャート（11-4）。座標の計算は buildWeightChartData（lib/calories.ts）で済ませ、ここは描くだけ
const W = 340
const H = 200
const PAD = { top: 18, right: 10, bottom: 22, left: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const AMBER = '#fbbf24' // amber-400
const STONE_300 = '#d6d3d1'
const STONE_500 = '#78716c'
const STONE_700 = '#44403c'
const STONE_800 = '#292524'

function shortDate(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

export function WeightChart({ data, today }: { data: WeightChartData; today: string }) {
  const { from, days, yMin, yMax } = data
  const x = (date: string) => PAD.left + (days <= 1 ? 0 : (daysBetween(from, date) / (days - 1)) * PLOT_W)
  const y = (kg: number) => PAD.top + ((yMax - kg) / (yMax - yMin || 1)) * PLOT_H
  const path = (pts: WeightChartPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')

  // 縦軸の目盛り：0.5kg単位で4本前後
  const span = yMax - yMin
  const step = Math.max(0.5, Math.ceil(span / 4 / 0.5) * 0.5)
  const ticks: number[] = []
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) ticks.push(v)

  const xLabels = [from, data.to]
  const showToday = today >= from && today <= data.to

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="体重の進捗チャート">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={STONE_800} strokeWidth={1} />
          <text x={PAD.left - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill={STONE_500}>
            {Number.isInteger(v) ? v : v.toFixed(1)}
          </text>
        </g>
      ))}

      {data.gateMarkers.map((g) => (
        <g key={g.gateIndex}>
          <line
            x1={x(g.date)}
            x2={x(g.date)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke={STONE_700}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text x={x(g.date)} y={PAD.top - 6} textAnchor="middle" fontSize={9} fill={STONE_500}>
            ゲート{g.gateIndex}
          </text>
        </g>
      ))}

      {showToday && (
        <line x1={x(today)} x2={x(today)} y1={PAD.top} y2={H - PAD.bottom} stroke={STONE_500} strokeWidth={1} opacity={0.4} />
      )}

      {/* 目標ライン（点線） */}
      <path d={path(data.targetLine)} fill="none" stroke={STONE_300} strokeWidth={1.25} strokeDasharray="4 4" opacity={0.6} />

      {/* 毎日の体重（薄く小さく） */}
      {data.dailyPoints.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={1.8} fill={STONE_300} opacity={0.45} />
      ))}

      {/* 7日平均の線 */}
      {data.averageSegments.map((seg) =>
        seg.length === 1 ? (
          <circle key={seg[0].date} cx={x(seg[0].date)} cy={y(seg[0].kg)} r={2.2} fill={AMBER} />
        ) : (
          <path key={seg[0].date} d={path(seg)} fill="none" stroke={AMBER} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        )
      )}

      {xLabels.map((d, i) => (
        <text
          key={d + i}
          x={x(d)}
          y={H - 6}
          textAnchor={i === 0 ? 'start' : 'end'}
          fontSize={9}
          fill={STONE_500}
        >
          {shortDate(d)}
        </text>
      ))}
    </svg>
  )
}
