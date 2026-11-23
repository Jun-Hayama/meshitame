'use client'

// 誘いのリンクを開いたページ（18章 5・6）
// 中身（誘った人の名前とキャラクター・約束の日付・食べもの・場所・状態）は、未ログインでも読める get_invite で見せる
// 未ログインなら、トークンを端末に保存してからログイン（または登録）へ。ログインのあとにここへ戻す

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FriendProfileForm } from '@/components/FriendProfileForm'
import { CHEAT_PLACE_LABELS, type FriendProfileRow, type InviteStatus, type InviteView } from '@/types'
import { describePromiseName, formatDateJST, getPromiseEmoji } from '@/lib/calories'
import { insertPlannedCheat } from '@/lib/plannedCheat'
import {
  INVITE_STATUS_MESSAGES,
  clearPendingJoinToken,
  describeFriendError,
  fetchMyProfile,
  getInvite,
  isValidInviteToken,
  joinInvite,
  savePendingJoinToken,
  scheduleFriendSync,
  setPromiseCheat,
} from '@/lib/friends'

export default function JoinPage() {
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const today = formatDateJST(new Date())
  const [invite, setInvite] = useState<InviteView | null>(null)
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [profile, setProfile] = useState<FriendProfileRow | null | undefined>(undefined)
  const validToken = isValidInviteToken(token)
  const [status, setStatus] = useState<InviteStatus | null>(validToken ? null : 'not_found')
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!validToken) return
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUserId(user?.id ?? null)
      if (user) clearPendingJoinToken() // 戻ってこられたので、保存したトークンは消す
      try {
        const [view, prof] = await Promise.all([getInvite(token), user ? fetchMyProfile(user.id) : Promise.resolve(null)])
        setInvite(view)
        setStatus(view.status)
        setProfile(prof)
      } catch (e) {
        setError(describeFriendError(e))
      }
    })
  }, [token, validToken])

  function goLogin() {
    savePendingJoinToken(token)
    router.push('/login')
  }

  async function join() {
    if (!userId) return
    setJoining(true)
    setError(null)
    try {
      const result = await joinInvite(token)
      if (result.status !== 'ok') {
        setStatus(result.status)
      } else {
        // 自分の予定のチートとして、同じ日付・食事・品で入れる（食事が昼・夜なら hearty も）
        if (result.promise) {
          const row = await insertPlannedCheat(userId, {
            date: result.promise.date,
            place: result.promise.place,
            items: result.promise.items,
          })
          await setPromiseCheat(result.promise.id, userId, row.id)
        }
        scheduleFriendSync(userId)
        setJoined(true)
      }
    } catch (e) {
      setError(describeFriendError(e))
    }
    setJoining(false)
  }

  const p = invite?.promise ?? null
  const who = invite?.creator_name ? `${invite.creator_character ?? ''}${invite.creator_name}さん` : ''
  const promiseName = p ? describePromiseName({ promise_date: p.date, label: p.label }, today) : ''

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 px-5 pt-16 pb-16">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-center mb-8">
          <span className="text-amber-400">メシ</span>ため
        </h1>

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {status === null || (validToken && userId === undefined) ? (
          !error && <p className="text-amber-400 text-sm text-center">読み込み中...</p>
        ) : (
          <div className="space-y-4">
            {invite && invite.status !== 'not_found' && (
              <section className="bg-stone-900 rounded-3xl p-5">
                <p className="text-stone-400 text-xs mb-2">{who}からの{p ? '約束のお誘い' : '友だちの招待'}</p>
                {p ? (
                  <>
                    <p className="text-lg font-bold">
                      {getPromiseEmoji(p.items)} {promiseName}
                    </p>
                    <p className="text-stone-500 text-xs mt-1">
                      {CHEAT_PLACE_LABELS[p.place]}
                      {p.venue && ` ・ 📍${p.venue}`}
                    </p>
                    <p className="text-stone-500 text-xs mt-3">
                      その日に向けて、それぞれメシためを貯めます。体重の数字は、おたがいに見えません。
                    </p>
                  </>
                ) : (
                  <p className="text-sm">メシためで、一緒に食べる約束ができるようになります。体重の数字は、おたがいに見えません。</p>
                )}
              </section>
            )}

            {joined ? (
              <section className="text-center">
                <p className="font-bold mb-1">{p ? '参加しました' : '友だちになりました'}</p>
                {p && <p className="text-stone-500 text-xs mb-4">チートのタブの予定にも入りました</p>}
                <button
                  type="button"
                  onClick={() => router.push('/friends')}
                  className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
                >
                  フレンドを見る
                </button>
              </section>
            ) : status !== 'ok' ? (
              <section className="text-center">
                <p className="text-stone-300 text-sm mb-4">{INVITE_STATUS_MESSAGES[status]}</p>
                <button
                  type="button"
                  onClick={() => router.push(userId ? '/friends' : '/login')}
                  className="w-full bg-stone-800 text-stone-300 py-3 rounded-2xl text-sm"
                >
                  {userId ? 'フレンドを見る' : 'ログイン'}
                </button>
              </section>
            ) : !userId ? (
              <section>
                <button type="button" onClick={goLogin} className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm">
                  ログインして参加する
                </button>
                <p className="text-stone-500 text-xs text-center mt-2">はじめての方も、次の画面で登録できます</p>
              </section>
            ) : profile === null ? (
              <FriendProfileForm
                userId={userId}
                profile={null}
                note={`${who}に見える名前とキャラクターを、先に決めてください`}
                submitLabel="決めて次へ"
                onSaved={setProfile}
              />
            ) : (
              <section>
                <p className="font-bold text-center mb-4">
                  {p ? `${who}の「${promiseName}」に参加しますか？` : `${who}と友だちになりますか？`}
                </p>
                <button
                  type="button"
                  disabled={joining}
                  onClick={join}
                  className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
                >
                  {joining ? '参加しています...' : p ? '参加する' : '友だちになる'}
                </button>
                <button type="button" onClick={() => router.push('/')} className="w-full mt-3 py-3 text-stone-500 text-sm">
                  やめる
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
