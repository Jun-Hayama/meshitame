'use client'

// 一緒に食べる約束を作る（18章 5）。日付は明日から60日以内、食事は昼／夜／追加チート（初期値は夜）
// 作った人の予定のチートとして入れる（チートのタブの「予定に入れる」と同じ保存のしかた）→ 誘いのリンクを送る

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { CheatItemPicker } from '@/components/CheatItemPicker'
import { FriendProfileForm } from '@/components/FriendProfileForm'
import { Toast } from '@/components/Toast'
import type { CheatPlace, FriendProfileRow, GoalPlanRow, MonthlyWantRow, PromisePlace } from '@/types'
import { describePromiseLine, describePromiseName, formatDateJST, getCheatPlace, getPromiseDateRange } from '@/lib/calories'
import { PROMISE_VENUE_MAX } from '@/lib/calorieConstants'
import { savePlannedHearty } from '@/lib/plannedCheat'
import {
  createInvite,
  createPromise,
  describeFriendError,
  fetchMyProfile,
  scheduleFriendSync,
  setPromiseCheat,
  shareInvite,
} from '@/lib/friends'

const PROMISE_PLACES: CheatPlace[] = ['lunch', 'dinner', 'extra']

export default function NewPromisePage() {
  const router = useRouter()
  const today = formatDateJST(new Date())
  const range = getPromiseDateRange(today)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<FriendProfileRow | null | undefined>(undefined)
  const [goal, setGoal] = useState<GoalPlanRow | null>(null)
  const [venue, setVenue] = useState('')
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ token: string; date: string; label: string; items: MonthlyWantRow['items'] } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const [{ data: goalData }, prof] = await Promise.all([
        supabase.from('goal_plans').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
        fetchMyProfile(user.id).catch((e) => {
          setError(describeFriendError(e))
          return null
        }),
      ])
      setGoal((goalData as GoalPlanRow) ?? null)
      setProfile(prof)
    })
  }, [router])

  // 予定のチートを保存したら、約束を作って、作った人を参加者に入れる。約束を作れなければチートを外す
  async function handleSaved(row: MonthlyWantRow | null) {
    setPicking(false)
    if (!row || !userId || !row.scheduled_date) return
    setSaving(true)
    setError(null)
    try {
      const place = getCheatPlace(row) as PromisePlace
      const promiseId = await createPromise({
        date: row.scheduled_date,
        place,
        items: row.items ?? [],
        label: row.label ?? '',
        venue: venue.trim(),
      }).catch(async (e) => {
        await supabase.from('monthly_wants').update({ is_active: false }).eq('id', row.id)
        throw e
      })
      await setPromiseCheat(promiseId, userId, row.id)
      await savePlannedHearty(userId, row)
      const token = await createInvite(promiseId)
      setCreated({ token, date: row.scheduled_date, label: row.label ?? '', items: row.items })
      scheduleFriendSync(userId)
    } catch (e) {
      setError(describeFriendError(e))
    }
    setSaving(false)
  }

  async function share() {
    if (!created) return
    const name = describePromiseName({ promise_date: created.date, label: created.label }, today)
    const result = await shareInvite(created.token, `「${name}」の約束です。メシためで一緒に準備しませんか？`)
    if (result === 'copied') setToast('リンクをコピーしました')
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-6 flex items-end justify-between">
          <h1 className="text-xl font-bold">一緒に食べる約束</h1>
          <button type="button" onClick={() => router.push('/friends')} className="text-stone-500 text-xs">
            フレンドに戻る
          </button>
        </header>

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {profile === undefined || !userId ? (
          !error && <p className="text-amber-400 text-sm">読み込み中...</p>
        ) : profile === null ? (
          <FriendProfileForm
            userId={userId}
            profile={null}
            note="誘う相手に見える名前とキャラクターを、先に決めてください"
            onSaved={setProfile}
          />
        ) : created ? (
          <section className="bg-stone-900 rounded-3xl p-5 text-center">
            <p className="font-bold mb-1">{describePromiseLine({ promise_date: created.date, label: created.label, items: created.items ?? [] }, today)}</p>
            <p className="text-stone-500 text-xs mb-5">チートのタブの予定にも入りました。誘いのリンクを友だちに送ってください</p>
            <button type="button" onClick={share} className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm">
              誘いのリンクを送る
            </button>
            <button type="button" onClick={() => router.push('/friends')} className="w-full mt-3 py-3 text-stone-500 text-sm">
              フレンドに戻る
            </button>
          </section>
        ) : (
          <section className="space-y-4">
            <p className="text-stone-400 text-sm">
              日にちと食べるものを決めると、それぞれの予定のチートに入ります。その日に向けて、メシためを貯めていきます。
            </p>
            <div>
              <label htmlFor="venue" className="text-stone-500 text-xs mb-1.5 block">
                場所（なくてもOK・{PROMISE_VENUE_MAX}文字まで）
              </label>
              <input
                id="venue"
                value={venue}
                maxLength={PROMISE_VENUE_MAX}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="駅前の焼肉屋など"
                className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => setPicking(true)}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
            >
              {saving ? '保存中...' : '日にちと食べるものを決める'}
            </button>
          </section>
        )}
      </div>

      {picking && userId && (
        <CheatItemPicker
          userId={userId}
          goal={goal}
          today={today}
          target={{ kind: 'plan', date: range.min }}
          planOptions={{ ...range, places: PROMISE_PLACES, title: '一緒に食べる約束', submitLabel: '約束を作る' }}
          onClose={() => setPicking(false)}
          onSaved={handleSaved}
        />
      )}

      {toast && <Toast message={toast} onDone={clearToast} />}

      <BottomNav active="home" />
    </div>
  )
}
