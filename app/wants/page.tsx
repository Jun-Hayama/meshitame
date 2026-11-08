'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { CheatItemPicker } from '@/components/CheatItemPicker'
import {
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  type GoalPlanRow,
  type MonthlyWantRow,
} from '@/types'
import {
  calcCurrentMonthTargets,
  calcMealSlotTargets,
  formatDateJST,
  getMonthlyWantRowCost,
} from '@/lib/calories'

function monthLabel(year: number, month: number) {
  return `${year}年${month}月`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export default function WantsPage() {
  const router = useRouter()
  const today = formatDateJST(new Date())
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)))
  const [rows, setRows] = useState<MonthlyWantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [goal, setGoal] = useState<GoalPlanRow | null>(null)
  const [addDate, setAddDate] = useState<string | null>(null) // null なら追加画面は閉じている

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      load(user.id)
    })
  }, [router])

  async function load(userId: string) {
    setLoading(true)
    setError(null)
    const [{ data, error: qErr }, { data: goalData }] = await Promise.all([
      supabase
        .from('monthly_wants')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('goal_plans').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle(),
    ])
    setGoal((goalData as GoalPlanRow) ?? null)

    if (qErr) {
      setError(
        qErr.message.includes('relation') || qErr.code === '42P01'
          ? 'DBの migration_v2_monthly_wants.sql をまだ実行していないようです'
          : qErr.message
      )
      setRows([])
    } else {
      setRows((data as MonthlyWantRow[]) || [])
    }
    setLoading(false)
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const dated = useMemo(
    () => rows.filter((r) => r.scheduled_date && r.scheduled_date.startsWith(prefix)),
    [rows, prefix]
  )
  const frequent = useMemo(
    () => rows.filter((r) => r.times_per_week != null),
    [rows]
  )

  // 表示している月の朝昼夜の目安（置き換えのコストに使う）
  const slotTargets = useMemo(
    () =>
      goal
        ? calcMealSlotTargets(calcCurrentMonthTargets(goal, new Date(`${prefix}-15T12:00:00+09:00`)).dailyIntakeKcal)
        : [],
    [goal, prefix]
  )
  const costOf = (w: MonthlyWantRow) => getMonthlyWantRowCost(w, slotTargets)

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  async function removeWant(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: upErr } = await supabase
      .from('monthly_wants')
      .update({ is_active: false })
      .eq('id', id)
    if (upErr) {
      setError(upErr.message)
      return
    }
    await load(user.id)
  }

  const calendarDays = daysInMonth(year, month)
  const firstDow = new Date(year, month - 1, 1).getDay() // 0=日
  const datedByDay = new Map<number, MonthlyWantRow[]>()
  for (const r of dated) {
    const day = Number(r.scheduled_date!.slice(8, 10))
    const list = datedByDay.get(day) ?? []
    list.push(r)
    datedByDay.set(day, list)
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-6">
          <h1 className="text-xl font-bold">
            <span className="text-amber-400">★</span> チート
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            予定が決まっているものも、毎週の頻度もここに置く
          </p>
        </header>

        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => shiftMonth(-1)} className="text-stone-500 px-2 py-1">‹</button>
          <p className="text-sm font-medium">{monthLabel(year, month)}</p>
          <button type="button" onClick={() => shiftMonth(1)} className="text-stone-500 px-2 py-1">›</button>
        </div>

        {error && (
          <p className="text-rose-400 text-sm mb-4">{error}</p>
        )}

        {loading ? (
          <p className="text-amber-400 text-sm">読み込み中...</p>
        ) : (
          <>
            {/* 簡易カレンダー */}
            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] text-stone-600">
              {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-6">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {Array.from({ length: calendarDays }, (_, i) => {
                const day = i + 1
                const key = `${prefix}-${String(day).padStart(2, '0')}`
                const items = datedByDay.get(day) ?? []
                const isToday = key === today
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setAddDate(key)}
                    className={`aspect-square rounded-xl text-xs flex flex-col items-center justify-center border ${
                      isToday ? 'border-amber-400/60' : 'border-stone-800'
                    } ${items.length ? 'bg-amber-400/10' : 'bg-stone-900'}`}
                  >
                    <span className={isToday ? 'text-amber-400' : 'text-stone-400'}>{day}</span>
                    {items.length > 0 && (
                      <span className="text-[10px] leading-none mt-0.5">
                        {items.map((w) => WANT_KIND_EMOJI[w.kind]).join('')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <section className="mb-6">
              <h2 className="text-sm font-semibold text-stone-300 mb-3">この月の予定</h2>
              {dated.length === 0 ? (
                <p className="text-stone-600 text-sm">まだ日付指定のチートはありません</p>
              ) : (
                <ul className="space-y-2">
                  {dated.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{WANT_KIND_EMOJI[w.kind]}</span>
                        <div>
                          <p className="text-sm font-medium">
                            {w.scheduled_date!.slice(5).replace('-', '/')} {w.label || WANT_KIND_LABELS[w.kind]}
                          </p>
                          <p className="text-stone-500 text-xs">{costOf(w)}pt</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWant(w.id)}
                        className="text-stone-600 text-xs px-2"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mb-6">
              <h2 className="text-sm font-semibold text-stone-300 mb-3">毎週の頻度</h2>
              {frequent.length === 0 ? (
                <p className="text-stone-600 text-sm">例：晩酌は週3回、など</p>
              ) : (
                <ul className="space-y-2">
                  {frequent.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{WANT_KIND_EMOJI[w.kind]}</span>
                        <div>
                          <p className="text-sm font-medium">
                            {w.label || WANT_KIND_LABELS[w.kind]} · 週{w.times_per_week}回
                          </p>
                          <p className="text-stone-500 text-xs">
                            1回 {costOf(w)}pt
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWant(w.id)}
                        className="text-stone-600 text-xs px-2"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <button
              type="button"
              onClick={() => setAddDate(today.startsWith(prefix) ? today : `${prefix}-01`)}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
            >
              チートを追加
            </button>
          </>
        )}
      </div>

      {addDate && userId && (
        <CheatItemPicker
          userId={userId}
          goal={goal}
          initialDate={addDate}
          onClose={() => setAddDate(null)}
          onSaved={() => {
            setAddDate(null)
            load(userId)
          }}
        />
      )}

      <BottomNav active="wants" />
    </div>
  )
}
