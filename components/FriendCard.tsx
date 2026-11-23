'use client'

// 今日の画面のフレンドカード（18章 3）。押すと /friends
// 友だちも約束もない → ボタンだけ / 約束がある → いちばん近い約束と参加者の準備の具合 / 友だちがいる → 小さなコース

import { useEffect, useState } from 'react'
import { describePromiseLine, splitPromises } from '@/lib/calories'
import { loadFriendOverview, type FriendOverview } from '@/lib/friends'
import { FriendCourse } from '@/components/FriendCourse'
import { PromiseMembers, isViewAllReady } from '@/components/PromiseMembers'

export function FriendCard({ userId, today, onOpen }: { userId: string; today: string; onOpen: () => void }) {
  const [overview, setOverview] = useState<FriendOverview | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    loadFriendOverview(userId).then(
      (o) => { if (alive) setOverview(o) },
      () => { if (alive) setFailed(true) } // 読めなくても画面にエラーは出さない（ボタンだけ出す）
    )
    return () => { alive = false }
  }, [userId])

  if (!overview && !failed) return null

  const upcoming = overview
    ? splitPromises(overview.promises.map((v) => ({ ...v, promise_date: v.promise.promise_date, status: v.promise.status })), today).upcoming
    : []
  const next = upcoming[0] ?? null
  const friends = overview?.friends ?? []

  if (!next && friends.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="w-full bg-stone-900 rounded-2xl px-4 py-3 text-sm text-amber-400 font-medium"
      >
        🤝 友だちと食べる約束をする
      </button>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className="bg-stone-900 rounded-2xl px-4 py-3 cursor-pointer"
    >
      {next ? (
        <>
          <p className="text-sm font-medium mb-2">
            {describePromiseLine(next.promise, today)}
            {isViewAllReady(next) && <span className="text-amber-400 text-xs ml-2">みんな準備OK</span>}
          </p>
          <PromiseMembers view={next} today={today} compact />
        </>
      ) : (
        overview?.me && <FriendCourse people={[overview.me, ...friends]} today={today} compact />
      )}
    </div>
  )
}
