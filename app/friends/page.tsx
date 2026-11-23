'use client'

// フレンド（docs/v2-spec.md 18章）：これからの約束・コース・友だちの一覧・名前とキャラクター・隠す設定
// 勝ち負けはつけない。体重の数字（kg）は出さない

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { Toast } from '@/components/Toast'
import { FriendProfileForm } from '@/components/FriendProfileForm'
import { FriendCourse } from '@/components/FriendCourse'
import { PromiseMembers, isViewAllReady } from '@/components/PromiseMembers'
import { CHEAT_PLACE_LABELS } from '@/types'
import { describePromiseLine, describePromiseName, formatDateJST, formatDayInText, splitPromises } from '@/lib/calories'
import { FRIEND_MAX } from '@/lib/calorieConstants'
import {
  cancelPromise,
  createInvite,
  describeFriendError,
  leavePromise,
  loadFriendOverview,
  saveMyProfile,
  scheduleFriendSync,
  shareInvite,
  stopInvite,
  syncFriendData,
  unfriend,
  type FriendOverview,
  type FriendPerson,
  type PromiseView,
} from '@/lib/friends'

const KEEP_CHEAT_NOTE = '予定のチートはそのまま残ります。チートのタブで消せます。'

type Confirm =
  | { kind: 'cancel'; view: PromiseView }
  | { kind: 'leave'; view: PromiseView }
  | { kind: 'unfriend'; person: FriendPerson }

export default function FriendsPage() {
  const router = useRouter()
  const today = formatDateJST(new Date())
  const [userId, setUserId] = useState<string | null>(null)
  const [overview, setOverview] = useState<FriendOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const reload = useCallback(async (uid: string) => {
    try {
      setOverview(await loadFriendOverview(uid))
    } catch (e) {
      setError(describeFriendError(e))
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      await reload(user.id)
      // 開いたときに自分の分を書き出してから、もう一度読む（失敗しても何も出さない）
      syncFriendData(user.id).then(() => reload(user.id), () => {})
    })
  }, [router, reload])

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (!userId) return false
    setBusy(true)
    setError(null)
    let ok = true
    try {
      await action()
      await reload(userId)
    } catch (e) {
      setError(describeFriendError(e))
      ok = false
    }
    setBusy(false)
    return ok
  }

  async function share(promise: PromiseView | null) {
    await run(async () => {
      const token = await createInvite(promise?.promise.id ?? null)
      const text = promise
        ? `「${describePromiseName(promise.promise, today)}」の約束です。メシためで一緒に準備しませんか？`
        : 'メシためで友だちになりませんか？'
      const result = await shareInvite(token, text)
      if (result === 'copied') setToast('リンクをコピーしました')
    })
  }

  async function doConfirm() {
    if (!confirm) return
    const c = confirm
    setConfirm(null)
    const ok = await run(async () => {
      if (c.kind === 'cancel') await cancelPromise(c.view.promise.id)
      if (c.kind === 'leave') await leavePromise(c.view.promise.id)
      if (c.kind === 'unfriend') await unfriend(c.person.userId)
    })
    if (ok && c.kind !== 'unfriend') setToast(KEEP_CHEAT_NOTE)
  }

  async function toggleHide(hide: boolean) {
    if (!userId || !overview?.profile) return
    await run(async () => {
      await saveMyProfile(userId, { hide_cheats: hide })
      scheduleFriendSync(userId)
    })
  }

  const profile = overview?.profile ?? null
  const { upcoming, past } = overview
    ? splitPromises(overview.promises.map((v) => ({ ...v, promise_date: v.promise.promise_date, status: v.promise.status })), today)
    : { upcoming: [], past: [] }
  const invitesFor = (promiseId: string | null) => (overview?.invites ?? []).filter((i) => i.promise_id === promiseId)
  const friends = overview?.friends ?? []

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold">🤝 フレンド</h1>
            <p className="text-stone-500 text-xs mt-1">一緒に食べる約束に向けて、それぞれメシためを貯めます</p>
          </div>
          <button type="button" onClick={() => router.push('/')} className="text-stone-500 text-xs">
            今日に戻る
          </button>
        </header>

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {!overview || !userId ? (
          !error && <p className="text-amber-400 text-sm">読み込み中...</p>
        ) : !profile || editingProfile ? (
          <FriendProfileForm
            userId={userId}
            profile={profile}
            note={profile ? '友だちに見えるのは、この名前とキャラクターです' : 'はじめに、友だちに見える名前とキャラクターを決めてください'}
            onCancel={profile ? () => setEditingProfile(false) : undefined}
            onSaved={() => {
              setEditingProfile(false)
              scheduleFriendSync(userId)
              reload(userId)
            }}
          />
        ) : (
          <main className="space-y-8">
            <button
              type="button"
              onClick={() => router.push('/friends/promise/new')}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
            >
              一緒に食べる約束をする
            </button>

            {/* これからの約束 */}
            <section>
              <h2 className="text-sm font-semibold text-stone-300 mb-3">これからの約束</h2>
              {upcoming.length === 0 ? (
                <p className="text-stone-600 text-sm">まだ約束はありません</p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((view) => {
                    const p = view.promise
                    const links = invitesFor(p.id)
                    return (
                      <li key={p.id} className="bg-stone-900 rounded-2xl px-4 py-4">
                        <p className="text-sm font-bold">
                          {describePromiseLine(p, today)}
                          {isViewAllReady(view) && <span className="text-amber-400 text-xs ml-2">みんな準備OK</span>}
                        </p>
                        <p className="text-stone-500 text-xs mt-0.5 mb-3">
                          {CHEAT_PLACE_LABELS[p.place]}
                          {p.venue && ` ・ 📍${p.venue}`}
                        </p>
                        <PromiseMembers view={view} today={today} />
                        <div className="flex flex-wrap gap-2 mt-4">
                          {view.isCreator ? (
                            <>
                              <button
                                type="button"
                                disabled={busy || p.promise_date <= today}
                                onClick={() => share(view)}
                                className="bg-stone-800 text-amber-400 text-xs px-3 py-1.5 rounded-full disabled:opacity-40"
                              >
                                誘いのリンクを送る
                              </button>
                              {links.length > 0 && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => run(async () => { for (const l of links) await stopInvite(l.token) })}
                                  className="bg-stone-800 text-stone-400 text-xs px-3 py-1.5 rounded-full"
                                >
                                  リンクを止める
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirm({ kind: 'cancel', view })}
                                className="text-stone-500 text-xs px-2 py-1.5 ml-auto"
                              >
                                取りやめ
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirm({ kind: 'leave', view })}
                              className="text-stone-500 text-xs px-2 py-1.5 ml-auto"
                            >
                              抜ける
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* コース */}
            {overview.me && (
              <section>
                <h2 className="text-sm font-semibold text-stone-300 mb-1">コース</h2>
                <p className="text-stone-600 text-[11px] mb-3">好きなものを食べながら、目標体重に近づいている様子です</p>
                <div className="bg-stone-900 rounded-2xl px-4 py-4">
                  <FriendCourse people={[overview.me, ...friends]} today={today} />
                </div>
              </section>
            )}

            {/* 友だち */}
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-stone-300">友だち</h2>
                <span className="text-stone-600 text-xs">
                  {friends.length}/{FRIEND_MAX}人
                </span>
              </div>
              {friends.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {friends.map((f) => (
                    <li key={f.userId} className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-2.5">
                      <span className="text-sm">
                        {f.character} {f.name}
                      </span>
                      <button type="button" onClick={() => setConfirm({ kind: 'unfriend', person: f })} className="text-stone-600 text-xs">
                        友だちをやめる
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || friends.length >= FRIEND_MAX}
                  onClick={() => share(null)}
                  className="bg-stone-800 text-amber-400 text-xs px-3 py-1.5 rounded-full disabled:opacity-40"
                >
                  ＋ 友だちを招待
                </button>
                {invitesFor(null).length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(async () => { for (const l of invitesFor(null)) await stopInvite(l.token) })}
                    className="bg-stone-800 text-stone-400 text-xs px-3 py-1.5 rounded-full"
                  >
                    招待のリンクを止める（{formatDayInText(formatDateJST(new Date(invitesFor(null)[0].expires_at)), today)}まで使えます）
                  </button>
                )}
              </div>
            </section>

            {/* これまでの約束（約束の日から30日たったら隠す） */}
            {past.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-stone-300 mb-3">これまでの約束</h2>
                <ul className="space-y-1.5">
                  {past.map((view) => (
                    <li key={view.promise.id} className="flex items-center justify-between bg-stone-900/60 rounded-2xl px-4 py-2.5 text-sm">
                      <span className="text-stone-400 truncate">
                        {describePromiseName(view.promise, today)}
                        <span className="ml-2">{view.members.map((m) => m.character).join('')}</span>
                      </span>
                      {view.promise.status === 'canceled' && <span className="text-stone-600 text-xs shrink-0 ml-2">取りやめ</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 自分 */}
            <section className="bg-stone-900 rounded-2xl px-4 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {profile.character_emoji} {profile.display_name}
                </span>
                <button type="button" onClick={() => setEditingProfile(true)} className="text-amber-400 text-xs">
                  変える
                </button>
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  チートの中身を友だちに見せない
                  <span className="block text-stone-500 text-[11px] mt-0.5">足あとやチートの数を🍽にします。約束の食べものはそのままです</span>
                </span>
                <input
                  type="checkbox"
                  checked={profile.hide_cheats}
                  disabled={busy}
                  onChange={(e) => toggleHide(e.target.checked)}
                  className="w-5 h-5 accent-amber-400 shrink-0"
                />
              </label>
            </section>
          </main>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-1">
              {confirm.kind === 'cancel'
                ? `「${describePromiseName(confirm.view.promise, today)}」を取りやめますか？`
                : confirm.kind === 'leave'
                  ? `「${describePromiseName(confirm.view.promise, today)}」から抜けますか？`
                  : `${confirm.person.name}さんと友だちをやめますか？`}
            </p>
            <p className="text-stone-500 text-xs mb-4">
              {confirm.kind === 'unfriend'
                ? 'おたがいの一覧から消えます。一緒に参加している約束はそのままです。'
                : confirm.kind === 'cancel'
                  ? `日付を変えたいときは、取りやめて作り直してください。${KEEP_CHEAT_NOTE}`
                  : KEEP_CHEAT_NOTE}
            </p>
            <button type="button" onClick={doConfirm} className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm">
              {confirm.kind === 'cancel' ? '取りやめる' : confirm.kind === 'leave' ? '抜ける' : '友だちをやめる'}
            </button>
            <button type="button" onClick={() => setConfirm(null)} className="w-full mt-3 py-3 text-stone-500 text-sm">
              やめる
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDone={clearToast} />}

      <BottomNav active="home" />
    </div>
  )
}
