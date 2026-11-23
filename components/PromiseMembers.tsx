'use client'

// 約束までの準備の具合（18章 5）：参加者ごとにキャラクター・名前・小さな棒と%。100%なら「準備OK」
// 約束の月がまだ始まっていなければ%は出さず「12月に入ったら貯めはじめ」

import type { PromiseView } from '@/lib/friends'
import { describePromiseNotStarted, isPromiseAllReady, isPromiseMonthAhead } from '@/lib/calories'

export function PromiseMembers({ view, today, compact = false }: { view: PromiseView; today: string; compact?: boolean }) {
  const { promise, members } = view
  if (isPromiseMonthAhead(promise.promise_date, today)) {
    return (
      <div>
        <p className="text-base leading-none">{members.map((m) => m.character).join(' ')}</p>
        <p className="text-stone-500 text-[11px] mt-1.5">{describePromiseNotStarted(promise.promise_date)}</p>
      </div>
    )
  }
  if (compact) {
    return (
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {members.map((m) => (
          <span key={m.userId} className="text-stone-400">
            {m.character}
            {m.readyPct !== null && <span className="ml-1">{m.readyPct === 100 ? '準備OK' : `${m.readyPct}%`}</span>}
          </span>
        ))}
      </p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {members.map((m) => (
        <li key={m.userId} className="flex items-center gap-2 text-xs">
          <span className="shrink-0">{m.character}</span>
          <span className="w-20 truncate text-stone-300">{m.name}</span>
          {m.readyPct !== null && (
            <>
              <span className="flex-1 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                <span className="block h-full bg-amber-400 rounded-full" style={{ width: `${m.readyPct}%` }} />
              </span>
              <span className={`w-14 text-right shrink-0 ${m.readyPct === 100 ? 'text-amber-400 font-bold' : 'text-stone-400'}`}>
                {m.readyPct === 100 ? '準備OK' : `${m.readyPct}%`}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

export function isViewAllReady(view: PromiseView): boolean {
  return isPromiseAllReady(view.members.map((m) => m.readyPct))
}
