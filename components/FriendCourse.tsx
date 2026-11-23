'use client'

// すごろくコース（18章 7）：横一本の道で1人1レーン。左がスタート、右端がゴール。いちばん上が自分
// 位置は目標体重への近づき具合（%）。kg は出さない。記録していない友だちは名前だけ（何も書かない）
// 足あと：色つき = なかったことにした / 薄い = まだ / ふつう = 消えた。今回は押しても何も起きない

import type { Footprint } from '@/types'
import type { FriendPerson } from '@/lib/friends'
import { describeCourseLine, describeWaterBadge } from '@/lib/calories'

const GOAL = '🏁🍖'

const FOOTPRINT_CLASS: Record<Footprint['look'], string> = {
  cleared: 'bg-amber-400/30 rounded-full px-0.5',
  pending: 'opacity-30',
  gone: '',
}

function badgeOf(person: FriendPerson, today: string): string | null {
  const p = person.progress
  if (!p) return null
  if (p.water_emoji && p.water_return_date && p.water_return_date >= today) {
    return describeWaterBadge(p.water_emoji, p.water_return_date, today)
  }
  return p.detour ? 'ちょっと寄り道中' : null
}

export function FriendCourse({ people, today, compact = false }: { people: FriendPerson[]; today: string; compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-2' : 'space-y-4'}>
      {people.map((person) => {
        const pct = person.progress?.approach_pct ?? null
        const badge = badgeOf(person, today)
        return (
          <li key={person.userId}>
            <p className="flex items-center gap-1.5 text-xs min-w-0">
              <span className="text-stone-300 truncate">
                {person.name}
                {person.isMe && <span className="text-stone-600 ml-1">（自分）</span>}
              </span>
              {badge && <span className="text-stone-500 text-[11px] shrink-0">{badge}</span>}
            </p>
            {pct === null ? (
              <p className="text-xl leading-none mt-1">{person.character}</p>
            ) : (
              <>
                <div className="flex items-center">
                  <div className={`relative flex-1 ${compact ? 'h-7' : 'h-10'}`}>
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-stone-700" />
                    {!compact &&
                      (person.progress?.footprints ?? []).map((f, i) => (
                        <span
                          key={i}
                          className={`absolute bottom-0 -translate-x-1/2 text-[10px] leading-none whitespace-nowrap ${FOOTPRINT_CLASS[f.look]}`}
                          style={{ left: `${f.pct}%` }}
                        >
                          {f.emoji}
                          {f.count > 1 && <span className="text-[8px] text-stone-400">×{f.count}</span>}
                        </span>
                      ))}
                    <span
                      className={`absolute -translate-x-1/2 leading-none ${compact ? 'top-0.5 text-lg' : 'top-0 text-xl'}`}
                      style={{ left: `${pct}%` }}
                    >
                      {person.character}
                    </span>
                  </div>
                  <span className="text-xs shrink-0 ml-3">{GOAL}</span>
                </div>
                {!compact && (
                  <p className="text-stone-500 text-[11px] mt-1">{describeCourseLine(person.progress?.cheat_counts ?? [], pct)}</p>
                )}
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
