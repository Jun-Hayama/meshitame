'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import {
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  type GoalPlanRow,
  type MealChoice,
  type MealLogRow,
  type MealSlot,
  type MonthlyWantRow,
} from '@/types'
import {
  buildMealPatterns,
  calcCurrentMonthTargets,
  calcLightMealCount,
  calcWantGauges,
  calcWeeklyWantSaving,
  countLightMealLogs,
  expandMonthlyWantsForWeek,
  formatDateJST,
  getWeekStart,
  sumWantCosts,
} from '@/lib/calories'
import { MEAL_RECORD_DELTA } from '@/lib/calorieConstants'

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'morning', label: '朝' },
  { slot: 'lunch', label: '昼' },
  { slot: 'dinner', label: '夜' },
]

const CHOICES: { choice: MealChoice; label: string }[] = [
  { choice: 'light', label: '控えめ' },
  { choice: 'normal', label: '目安どおり' },
  { choice: 'hearty', label: 'がっつり' },
]

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goal, setGoal] = useState<GoalPlanRow | null>(null)
  const [wants, setWants] = useState<MonthlyWantRow[]>([])
  const [todayLogs, setTodayLogs] = useState<MealLogRow[]>([])
  const [weekLogs, setWeekLogs] = useState<MealLogRow[]>([])
  const [patternStyle, setPatternStyle] = useState<'washoku' | 'yoshoku'>('washoku')
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null)

  const today = formatDateJST(new Date())
  const weekStart = getWeekStart(new Date())

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load(user.id)
    })
  }, [router])

  async function load(userId: string) {
    setLoading(true)
    setError(null)

    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return formatDateJST(d)
    })

    const [
      { data: goalData, error: goalErr },
      { data: wantData, error: wantErr },
      { data: mealData, error: mealErr },
    ] = await Promise.all([
      supabase.from('goal_plans').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle(),
      supabase.from('monthly_wants').select('*').eq('user_id', userId).eq('is_active', true),
      supabase
        .from('meal_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('log_date', weekDates[0])
        .lte('log_date', weekDates[6]),
    ])

    if (goalErr) setError(goalErr.message)
    if (wantErr && !wantErr.message.includes('relation')) setError(wantErr.message)
    if (mealErr && !mealErr.message.includes('relation')) setError(mealErr.message)

    if (wantErr?.message.includes('relation') || mealErr?.message.includes('relation')) {
      setError('DBの migration_v2_monthly_wants.sql を Supabase で実行してください')
    }

    setGoal((goalData as GoalPlanRow) ?? null)
    setWants((wantData as MonthlyWantRow[]) || [])
    const logs = (mealData as MealLogRow[]) || []
    setWeekLogs(logs)
    setTodayLogs(logs.filter((l) => l.log_date === today))
    setLoading(false)
  }

  const monthTargets = useMemo(
    () => (goal ? calcCurrentMonthTargets(goal, new Date()) : null),
    [goal]
  )

  const patterns = useMemo(
    () => (monthTargets ? buildMealPatterns(monthTargets.dailyIntakeKcal) : []),
    [monthTargets]
  )
  const activePattern = patterns.find((p) => p.style === patternStyle) ?? patterns[0]

  const weekEntries = useMemo(
    () => expandMonthlyWantsForWeek(wants, weekStart),
    [wants, weekStart]
  )
  const weekSaving = calcWeeklyWantSaving(new Date())
  const lightDone = countLightMealLogs(weekLogs)
  const lightPlan = calcLightMealCount(sumWantCosts(weekEntries), weekSaving, 0)
  // 控えめ1回 = 軽め150kcal としてゲージに入れる
  const earnedKcal = lightDone * 150
  const gauges = calcWantGauges(weekEntries, weekSaving, earnedKcal)

  const nextWant = useMemo(() => {
    const upcoming = wants
      .filter((w) => w.scheduled_date && w.scheduled_date >= today)
      .sort((a, b) => (a.scheduled_date as string).localeCompare(b.scheduled_date as string))
    return upcoming[0] ?? null
  }, [wants, today])

  async function setMealChoice(slot: MealSlot, choice: MealChoice) {
    setSavingSlot(slot)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error: upErr } = await supabase
      .from('meal_logs')
      .upsert(
        { user_id: user.id, log_date: today, slot, choice },
        { onConflict: 'user_id,log_date,slot' }
      )
      .select()
      .maybeSingle()

    setSavingSlot(null)
    if (upErr) {
      setError(upErr.message)
      return
    }
    if (data) {
      const row = data as MealLogRow
      setTodayLogs((prev) => {
        const rest = prev.filter((l) => l.slot !== slot)
        return [...rest, row]
      })
      setWeekLogs((prev) => {
        const rest = prev.filter((l) => !(l.log_date === today && l.slot === slot))
        return [...rest, row]
      })
    }
  }

  function choiceFor(slot: MealSlot): MealChoice | null {
    return todayLogs.find((l) => l.slot === slot)?.choice ?? null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="text-amber-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center px-6 pb-24">
        <div className="max-w-sm mx-auto w-full text-center">
          <h1 className="text-3xl font-bold mb-3">
            <span className="text-amber-400">メシ</span>ため
          </h1>
          <p className="text-stone-500 text-sm mb-8">
            まず目標を置くと、今日の目安と欲望ゲージが使えます
          </p>
          <button
            type="button"
            onClick={() => router.push('/setup')}
            className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
          >
            目標を設定する
          </button>
        </div>
        <BottomNav active="home" />
      </div>
    )
  }

  const [, monthStr, dayStr] = today.split('-')
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][new Date().getDay()]

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-stone-500 text-xs mb-1">
              {Number(monthStr)}月{Number(dayStr)}日{weekday}曜日
            </p>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-amber-400">メシ</span>ため
            </h1>
          </div>
          <p className="text-stone-500 text-xs text-right">
            目安 {monthTargets?.dailyIntakeKcal ?? '—'}kcal
            <br />
            貯金 {monthTargets?.dailySaving.savingKcal ?? '—'}kcal/日
          </p>
        </header>

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {/* 今日の目安パターン */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-300">今日の目安</h2>
            <div className="flex gap-1 bg-stone-900 rounded-xl p-1">
              {patterns.map((p) => (
                <button
                  key={p.style}
                  type="button"
                  onClick={() => setPatternStyle(p.style)}
                  className={`px-3 py-1 rounded-lg text-xs ${
                    patternStyle === p.style
                      ? 'bg-amber-400 text-stone-950 font-bold'
                      : 'text-stone-500'
                  }`}
                >
                  {p.styleLabel}
                </button>
              ))}
            </div>
          </div>
          {activePattern && (
            <ul className="space-y-2">
              {activePattern.slots.map((s) => (
                <li key={s.slot} className="bg-stone-900 rounded-2xl px-4 py-3">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-stone-500 text-xs">≒ {s.kcal}kcal</span>
                  </div>
                  <p className="text-stone-500 text-xs">{s.items}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3択記録 */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-stone-300 mb-3">今日の記録</h2>
          <div className="space-y-3">
            {SLOTS.map(({ slot, label }) => {
              const selected = choiceFor(slot)
              return (
                <div key={slot} className="bg-stone-900 rounded-2xl px-4 py-3">
                  <p className="text-sm font-medium mb-2">{label}</p>
                  <div className="flex gap-2">
                    {CHOICES.map(({ choice, label: cLabel }) => (
                      <button
                        key={choice}
                        type="button"
                        disabled={savingSlot === slot}
                        onClick={() => setMealChoice(slot, choice)}
                        className={`flex-1 py-2 rounded-xl text-xs ${
                          selected === choice
                            ? 'bg-amber-400 text-stone-950 font-bold'
                            : 'bg-stone-800 text-stone-400'
                        }`}
                      >
                        {cLabel}
                        {selected === choice && MEAL_RECORD_DELTA[choice] !== 0 && (
                          <span className="block text-[10px] opacity-80">
                            {MEAL_RECORD_DELTA[choice] > 0 ? '+' : ''}
                            {MEAL_RECORD_DELTA[choice]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 貯金ゲージ */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-300">今週の欲望ゲージ</h2>
            <button
              type="button"
              onClick={() => router.push('/wants')}
              className="text-amber-400 text-xs"
            >
              編集
            </button>
          </div>

          {weekEntries.length === 0 ? (
            <button
              type="button"
              onClick={() => router.push('/wants')}
              className="w-full bg-stone-900 rounded-2xl px-4 py-6 text-center"
            >
              <p className="text-stone-400 text-sm mb-1">まだ欲望がありません</p>
              <p className="text-amber-400 text-xs">タップして追加</p>
            </button>
          ) : (
            <ul className="space-y-3">
              {gauges.gauges.map((g) => {
                const pct = g.targetKcal === 0 ? 100 : Math.round((g.currentKcal / g.targetKcal) * 100)
                const name = g.want.label || WANT_KIND_LABELS[g.want.kind]
                return (
                  <li key={g.want.id} className="bg-stone-900 rounded-2xl px-4 py-3">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-sm font-medium">
                        {WANT_KIND_EMOJI[g.want.kind]} {name}
                        {g.want.date ? (
                          <span className="text-stone-500 text-xs ml-2">
                            {g.want.date.slice(5).replace('-', '/')}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-stone-500">
                        {g.achieved
                          ? '★達成！'
                          : g.targetKcal === 0
                            ? '貯金でカバー'
                            : `${g.currentKcal}/${g.targetKcal}kcal`}
                      </span>
                    </div>
                    <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    {!g.achieved && g.targetKcal > 0 && (
                      <p className="text-stone-600 text-[11px] mt-1.5">
                        あと軽め{g.remainingLightMeals}回分
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <p className="text-stone-500 text-xs mt-3">
            今週の軽め {lightDone}/{lightPlan.count}回
            {lightPlan.exceedsWeeklyMax && (
              <span className="text-amber-400"> · 週7回を超えるペース。運動か欲望の調整を</span>
            )}
          </p>
        </section>

        {nextWant && (
          <section className="mb-4">
            <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl px-4 py-3">
              <p className="text-amber-400 text-sm font-medium">
                {nextWant.scheduled_date!.slice(5).replace('-', '/')} は
                {WANT_KIND_EMOJI[nextWant.kind]}
                {nextWant.label || WANT_KIND_LABELS[nextWant.kind]}！
              </p>
            </div>
          </section>
        )}
      </div>

      <BottomNav active="home" />
    </div>
  )
}
