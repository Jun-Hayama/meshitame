'use client'

// チート（docs/v2-spec.md 16章 4）：カレンダー・食べた／予定の一覧・よく食べるもの
// 予定に入れた食事のチートは、meal_logs にも hearty を保存する（今日の画面の🔥チートと同じ形）

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { CheatItemPicker } from '@/components/CheatItemPicker'
import {
  CHEAT_PLACE_LABELS,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  WANT_KIND_LABELS,
  type GoalPlanRow,
  type MealLogRow,
  type MonthCheat,
  type MonthlyWantRow,
} from '@/types'
import { useReducePace } from '@/lib/reducePace'
import {
  calcDailyIntakeFromPace,
  calcMealSlotTargets,
  formatDateJST,
  getCheatEmoji,
  getCheatName,
  getCheatPlace,
  getCheatRowEmoji,
  getMonthDateRange,
  listCheatsInRange,
} from '@/lib/calories'

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

const kcal = (n: number) => `${n.toLocaleString('ja-JP')}kcal`

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
  const [mealLogs, setMealLogs] = useState<MealLogRow[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    async function load(userId: string) {
      setError(null)
      const [{ data, error: qErr }, { data: goalData }] = await Promise.all([
        supabase.from('monthly_wants').select('*').eq('user_id', userId).eq('is_active', true),
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

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      load(user.id)
    })
  }, [router, today])

  // 食事のチートのコストに使う朝昼夜の目安。1日の目安 = 必要量 − 減らすペース（12-3）
  const { pace } = useReducePace(userId)
  const slotTargets = useMemo(
    () => (goal && pace ? calcMealSlotTargets(calcDailyIntakeFromPace(goal.tdee, goal.bmr, pace)) : []),
    [goal, pace]
  )

  // 品なしの🔥チート（meal_logs の hearty）もこの月のチートとして出す
  useEffect(() => {
    if (!userId) return
    const { from, to } = getMonthDateRange(year, month)
    let alive = true
    supabase
      .from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('choice', 'hearty')
      .gte('log_date', from)
      .lte('log_date', to)
      .then(({ data }) => { if (alive) setMealLogs((data as MealLogRow[]) || []) })
    return () => { alive = false }
  }, [userId, year, month])

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const monthCheats = useMemo(
    () => listCheatsInRange({ wants: rows, mealLogs, slotTargets, ...getMonthDateRange(year, month) }),
    [rows, mealLogs, slotTargets, year, month]
  )
  const eaten = monthCheats.filter((c) => c.date <= today)
  const planned = monthCheats.filter((c) => c.date > today)
  // 頻度ベース（週◯回）の登録：コストには数えず、よく食べるものとしてだけ使う
  const frequent = useMemo(() => rows.filter((r) => r.scheduled_date == null && r.times_per_week != null), [rows])

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  // 削除：行を外す。食事のチートなら、その食事の hearty の記録も消す（ほかに同じ食事のチートがなければ）
  async function removeRow(row: MonthlyWantRow) {
    if (confirmDelete !== row.id) {
      setConfirmDelete(row.id)
      return
    }
    setConfirmDelete(null)
    const { error: upErr } = await supabase.from('monthly_wants').update({ is_active: false }).eq('id', row.id)
    if (upErr) {
      setError(upErr.message)
      return
    }
    const place = getCheatPlace(row)
    if (row.scheduled_date && userId && place !== 'extra') {
      const others = rows.some(
        (r) => r.id !== row.id && r.scheduled_date === row.scheduled_date && getCheatPlace(r) === place
      )
      if (!others) {
        const { error: delErr } = await supabase
          .from('meal_logs')
          .delete()
          .eq('user_id', userId)
          .eq('log_date', row.scheduled_date)
          .eq('slot', place)
          .eq('choice', 'hearty')
        if (delErr) setError(delErr.message)
        setMealLogs((prev) => prev.filter((l) => !(l.log_date === row.scheduled_date && l.slot === place)))
      }
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  async function handlePlanned(row: MonthlyWantRow | null) {
    setAddDate(null)
    if (!row || !userId) return
    setRows((prev) => [...prev, row])
    const place = getCheatPlace(row)
    if (place === 'extra' || !row.scheduled_date) return
    const { data, error: upErr } = await supabase
      .from('meal_logs')
      .upsert({ user_id: userId, log_date: row.scheduled_date, slot: place, choice: 'hearty' }, { onConflict: 'user_id,log_date,slot' })
      .select()
      .maybeSingle()
    if (upErr) {
      setError(upErr.message)
      return
    }
    if (data) {
      const log = data as MealLogRow
      setMealLogs((prev) => [...prev.filter((l) => !(l.log_date === log.log_date && l.slot === log.slot)), log])
    }
  }

  const calendarDays = daysInMonth(year, month)
  const firstDow = new Date(year, month - 1, 1).getDay() // 0=日
  const emojisByDay = new Map<number, string>()
  for (const c of monthCheats) {
    const day = Number(c.date.slice(8, 10))
    emojisByDay.set(day, (emojisByDay.get(day) ?? '') + getCheatEmoji(c))
  }

  const cheatRow = (c: MonthCheat) => (
    <li key={c.key} className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl shrink-0">{getCheatEmoji(c)}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            <span className="text-stone-400 mr-1.5">
              {Number(c.date.slice(8, 10))}日 {CHEAT_PLACE_LABELS[c.place]}
            </span>
            {c.kind === 'hearty' ? MEAL_CHOICE_LABELS.hearty : getCheatName(c)}
          </p>
          <p className="text-stone-500 text-xs">{kcal(c.costKcal)}</p>
        </div>
      </div>
      {c.row ? (
        <button
          type="button"
          onClick={() => removeRow(c.row as MonthlyWantRow)}
          className={`text-xs px-2 shrink-0 ${confirmDelete === c.row.id ? 'text-rose-300 font-bold' : 'text-stone-600'}`}
        >
          {confirmDelete === c.row.id ? 'もう一度で削除' : '削除'}
        </button>
      ) : (
        <span className="text-stone-600 text-[11px] shrink-0 ml-2">今日の画面で直せます</span>
      )}
    </li>
  )

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-6">
          <h1 className="text-xl font-bold">
            <span className="text-amber-400">{MEAL_CHOICE_EMOJI.hearty}</span> チート
          </h1>
          <p className="text-stone-500 text-sm mt-1">飲み会など、予定があるものはここに入れておきます</p>
        </header>

        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="前の月" className="text-stone-500 px-2 py-1">‹</button>
          <p className="text-sm font-medium">{year}年{month}月</p>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="次の月" className="text-stone-500 px-2 py-1">›</button>
        </div>

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-amber-400 text-sm">読み込み中...</p>
        ) : (
          <>
            {/* 簡易カレンダー（今日以降の日を押すと予定に入れる） */}
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
                const emojis = emojisByDay.get(day)
                const isToday = key === today
                const past = key < today
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={past}
                    onClick={() => setAddDate(key)}
                    className={`aspect-square rounded-xl text-xs flex flex-col items-center justify-center border ${
                      isToday ? 'border-amber-400/60' : 'border-stone-800'
                    } ${emojis ? 'bg-amber-400/10' : 'bg-stone-900'} ${past ? 'opacity-60' : ''}`}
                  >
                    <span className={isToday ? 'text-amber-400' : 'text-stone-400'}>{day}</span>
                    {emojis && <span className="text-[10px] leading-none mt-0.5 truncate max-w-full">{emojis}</span>}
                  </button>
                )
              })}
            </div>

            <section className="mb-6">
              <h2 className="text-sm font-semibold text-stone-300 mb-3">予定</h2>
              {planned.length === 0 ? (
                <p className="text-stone-600 text-sm">まだ予定はありません</p>
              ) : (
                <ul className="space-y-2">{planned.map(cheatRow)}</ul>
              )}
            </section>

            {eaten.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-stone-300 mb-3">食べた</h2>
                <ul className="space-y-2">{eaten.map(cheatRow)}</ul>
              </section>
            )}

            {frequent.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-stone-300 mb-1">よく食べるもの</h2>
                <p className="text-stone-600 text-xs mb-3">チートを足すとき、すぐ選べるように上に出します</p>
                <ul className="space-y-2">
                  {frequent.map((w) => (
                    <li key={w.id} className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{getCheatRowEmoji(w)}</span>
                        <p className="text-sm font-medium truncate">{w.label || WANT_KIND_LABELS[w.kind]}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(w)}
                        className={`text-xs px-2 shrink-0 ${confirmDelete === w.id ? 'text-rose-300 font-bold' : 'text-stone-600'}`}
                      >
                        {confirmDelete === w.id ? 'もう一度で削除' : '削除'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button
              type="button"
              onClick={() => setAddDate(today.startsWith(prefix) || prefix < today.slice(0, 7) ? today : `${prefix}-01`)}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
            >
              予定に入れる
            </button>
          </>
        )}
      </div>

      {addDate && userId && (
        <CheatItemPicker
          userId={userId}
          goal={goal}
          today={today}
          target={{ kind: 'plan', date: addDate }}
          onClose={() => setAddDate(null)}
          onSaved={handlePlanned}
        />
      )}

      <BottomNav active="wants" />
    </div>
  )
}
