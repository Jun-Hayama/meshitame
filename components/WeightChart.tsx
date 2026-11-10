'use client'

// 体重チャート（docs/v2-spec.md 14.4）：食べたチートの累計kcal（棒・後ろ）＋体重のならした線（前）
// 座標のもとになる値は buildCheatWeightChart（lib/calories.ts）で済ませ、ここは描くだけ。縦の目盛りは出さない

import { useState } from 'react'
import { describeWeightChangeShort } from '@/lib/calories'
import type { CheatWeightChartData, CheatWeightPoint } from '@/types'

const W = 340
const H = 200
const PAD = { top: 28, right: 8, bottom: 30, left: 8 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const AMBER_200 = '#fde68a'
const STONE_100 = '#f5f5f4'
const STONE_300 = '#d6d3d1'
const STONE_500 = '#78716c'

function shortDate(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

export function WeightChart({ data }: { data: CheatWeightChartData }) {
  const [selected, setSelected] = useState<number | null>(null)
  const n = Math.max(1, data.bars.length)
  const bw = PLOT_W / n
  const cx = (index: number) => PAD.left + (index + 0.5) * bw
  // 棒は上に絵文字を置く分だけ低めに
  const barH = (kcal: number) => (data.maxKcal > 0 ? (kcal / data.maxKcal) * PLOT_H * 0.85 : 0)
  const { yMin, yMax } = data
  const y = (kg: number) =>
    yMin === null || yMax === null ? 0 : PAD.top + ((yMax - kg) / (yMax - yMin || 1)) * PLOT_H
  const path = (pts: CheatWeightPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(p.index).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')

  const lastSegment = data.weightSegments[data.weightSegments.length - 1]
  const lastPoint = lastSegment?.[lastSegment.length - 1] ?? null
  const selectedBar = selected === null ? null : data.bars[selected]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="食べたチートの累計と体重のチャート">
        {/* 棒：その日（週）までに食べたチートの累計 */}
        {data.bars.map((b, i) => {
          if (b.cumulativeKcal === null) return null
          const h = barH(b.cumulativeKcal)
          const top = PAD.top + PLOT_H - h
          return (
            <g key={b.from}>
              {h > 0 && (
                <rect
                  x={PAD.left + i * bw + bw * 0.12}
                  y={top}
                  width={bw * 0.76}
                  height={h}
                  rx={Math.min(2, bw * 0.2)}
                  fill={AMBER_200}
                  opacity={selected === i ? 0.6 : 0.35}
                />
              )}
              {b.events.length > 0 && (
                <text
                  x={cx(i)}
                  y={top - 4}
                  textAnchor="middle"
                  fontSize={Math.min(12, Math.max(8, bw * 0.9))}
                  onClick={() => setSelected((cur) => (cur === i ? null : i))}
                  style={{ cursor: 'pointer' }}
                >
                  {b.events[0].emoji}
                  {b.events.length > 1 && (
                    <tspan fontSize={7} fill={STONE_300}>
                      ×{b.events.length}
                    </tspan>
                  )}
                </text>
              )}
            </g>
          )
        })}

        {/* 体重の点（薄く小さく） */}
        {yMin !== null &&
          data.weightPoints.map((p, i) => (
            <circle key={i} cx={cx(p.index)} cy={y(p.kg)} r={1.8} fill={STONE_300} opacity={0.5} />
          ))}

        {/* 体重のならした線（濃い色で前に） */}
        {yMin !== null &&
          data.weightSegments.map((seg) =>
            seg.length === 1 ? (
              <circle key={seg[0].index} cx={cx(seg[0].index)} cy={y(seg[0].kg)} r={2.4} fill={STONE_100} />
            ) : (
              <path
                key={seg[0].index}
                d={path(seg)}
                fill="none"
                stroke={STONE_100}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )
          )}

        {/* 線の右端の下に体重の変化 */}
        {lastPoint && data.weightChangeKg !== null && (
          <text
            x={Math.min(cx(lastPoint.index), W - PAD.right)}
            y={Math.min(y(lastPoint.kg) + 16, H - PAD.bottom + 12)}
            textAnchor={cx(lastPoint.index) > W / 2 ? 'end' : 'start'}
            fontSize={10}
            fill={STONE_100}
          >
            {describeWeightChangeShort(data.weightChangeKg)}
          </text>
        )}

        {[data.from, data.to].map((d, i) => (
          <text key={d + i} x={i === 0 ? PAD.left : W - PAD.right} y={H - 6} textAnchor={i === 0 ? 'start' : 'end'} fontSize={9} fill={STONE_500}>
            {shortDate(d)}
          </text>
        ))}
      </svg>

      {selectedBar && (
        <ul className="bg-stone-800 rounded-xl px-3 py-2 mt-1 space-y-0.5 text-xs">
          {selectedBar.events.map((e, i) => (
            <li key={i} className="flex justify-between">
              <span className="min-w-0 truncate">
                <span className="text-stone-500 mr-1.5">{shortDate(e.date)}</span>
                {e.name.startsWith(e.emoji) ? e.name : `${e.emoji} ${e.name}`}
              </span>
              <span className="text-stone-400 shrink-0 ml-2">{e.costPt}kcal</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
