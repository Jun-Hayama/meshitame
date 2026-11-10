'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { WeightEntryCard } from '@/components/WeightEntryCard'
import { WeightChart } from '@/components/WeightChart'
import { MilestoneCards } from '@/components/MilestoneCards'
import { useMilestones } from '@/lib/milestones'
import { useReducePace } from '@/lib/reducePace'
import type { CheatChartPeriod, GoalPlanRow, MealLogRow, MonthlyWantRow, WeightLog } from '@/types'
import {
  addDaysToDateStr,
  buildCheatWeightChart,
  buildTargetLine,
  calcDailyIntakeFromPace,
  calcMealSlotTargets,
  calcTargetGap,
  calcWeekOverWeek,
  calcWeightAverage,
  formatDateJST,
  formatWeightChange,
  formatMonthDayWeekday,
  getRecordableDateRange,
  isRecordableDate,
} from '@/lib/calories'

const LIST_LIMIT = 30
const PERIODS: { value: CheatChartPeriod; label: string }[] = [
  { value: 'month', label: '今月' },
  { value: 'all', label: 'はじめてから' },
]

export default function WeightPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [goal, setGoal] = useState<GoalPlanRow | null>(null)
  const [wants, setWants] = useState<MonthlyWantRow[]>([])
  const [heartyLogs, setHeartyLogs] = useState<MealLogRow[]>([])
  const [period, setPeriod] = useState<CheatChartPeriod>('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = formatDateJST(new Date())
  const recordRange = getRecordableDateRange(today)
  const [viewDate, setViewDate] = useState(today)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      // チャートの棒（14.4）：日付のあるチートとがっつり。はじめてからの分まで読む（がっつりの記録は多くない）
      const [
        { data, error: loadErr },
        { data: goalData, error: goalErr },
        { data: wantData, error: wantErr },
        { data: heartyData, error: heartyErr },
      ] = await Promise.all([
        supabase.from('weight_logs').select('*').eq('user_id', user.id).order('measured_at', { ascending: true }),
        supabase.from('goal_plans').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
        supabase.from('monthly_wants').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('meal_logs').select('*').eq('user_id', user.id).eq('choice', 'hearty'),
      ])
      const firstError = loadErr ?? goalErr ?? wantErr ?? heartyErr
      if (firstError) setError(firstError.message)
      setLogs((data as WeightLog[]) || [])
      setGoal((goalData as GoalPlanRow) ?? null)
      setWants((wantData as MonthlyWantRow[]) || [])
      setHeartyLogs((heartyData as MealLogRow[]) || [])
      setLoading(false)
    })
  }, [router])

  const byDate = useMemo(() => new Map(logs.map((l) => [l.measured_at, l])), [logs])
  const recent = useMemo(() => [...logs].reverse().slice(0, LIST_LIMIT), [logs])
  const average = useMemo(() => calcWeightAverage(logs, today), [logs, today])
  const weekOverWeek = useMemo(() => calcWeekOverWeek(logs, today), [logs, today])
  const todayLog = byDate.get(today) ?? null
  const { milestones, dismiss: dismissMilestone } = useMilestones(goal, average)
  const { pace } = useReducePace(userId)
  const slotTargets = useMemo(
    () => (goal && pace ? calcMealSlotTargets(calcDailyIntakeFromPace(goal.tdee, goal.bmr, pace)) : []),
    [goal, pace]
  )
  const chart = useMemo(
    () => buildCheatWeightChart({ period, today, weightLogs: logs, wants, mealLogs: heartyLogs, slotTargets }),
    [period, today, logs, wants, heartyLogs, slotTargets]
  )
  const gap = useMemo(
    () => (goal ? calcTargetGap(average.avgKg, buildTargetLine(goal), today) : null),
    [goal, average.avgKg, today]
  )

  function upsertLocal(row: WeightLog) {
    setLogs((prev) =>
      [...prev.filter((l) => l.measured_at !== row.measured_at), row].sort((a, b) =>
        a.measured_at.localeCompare(b.measured_at)
      )
    )
  }

  const prevDate = addDaysToDateStr(viewDate, -1)
  const nextDate = addDaysToDateStr(viewDate, 1)

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-6">
          <h1 className="text-xl font-bold">体重</h1>
          <p className="text-stone-500 text-xs mt-1">毎朝、起きてトイレのあとに測ろう</p>
        </header>

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : (
          <main className="space-y-6">
            {/* このところ（11-2・13.4）：計算は7日平均のまま。「7日平均」という言葉は出さない */}
            <section className="bg-stone-900 rounded-3xl p-6 text-center">
              <p className="text-stone-500 text-xs mb-1">
                このところ{average.isReference && average.avgKg !== null && <span className="ml-1">（参考値）</span>}
              </p>
              {average.avgKg === null ? (
                <p className="text-stone-500 text-sm py-3">この7日間の記録がまだありません</p>
              ) : (
                <>
                  <p className={`text-5xl font-bold ${average.isReference ? 'text-stone-400' : 'text-amber-400'}`}>
                    {average.avgKg.toFixed(1)}
                    <span className="text-xl text-stone-500 ml-1">kg前後</span>
                  </p>
                  <p className="text-stone-500 text-xs mt-2">
                    {todayLog ? `今朝 ${todayLog.weight_kg}kg` : '今朝はまだ'} ・ 7日間で{average.count}回
                  </p>
                  {weekOverWeek.diffKg !== null && (
                    <p className="text-sm mt-3">
                      <span className="text-stone-500 text-xs mr-1">前週比</span>
                      <span className={weekOverWeek.diffKg < -0.05 ? 'text-amber-400 font-bold' : 'text-stone-300 font-bold'}>
                        {formatWeightChange(weekOverWeek.diffKg)}
                      </span>
                      {weekOverWeek.diffKg > 0.05 && (
                        <span className="block text-stone-500 text-xs mt-1">日々のぶれは気にせず、流れで見ていこう</span>
                      )}
                      {weekOverWeek.isReference && (
                        <span className="block text-stone-600 text-xs mt-1">記録が少ないので参考値です</span>
                      )}
                    </p>
                  )}
                </>
              )}
            </section>

            <MilestoneCards milestones={milestones} onDismiss={dismissMilestone} />

            {/* チートの累計（棒）＋体重（線）（14.4） */}
            <section className="bg-stone-900 rounded-3xl p-4">
              <div className="flex gap-1 mb-3">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPeriod(p.value)}
                    className={`px-2.5 py-1 rounded-full text-xs ${
                      period === p.value ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="font-bold text-sm">
                  {period === 'month' ? `${Number(today.slice(5, 7))}月に食べたチート` : 'はじめてから食べたチート'}
                </h2>
                <span className="text-amber-400 font-bold">{chart.totalKcal.toLocaleString('ja-JP')}kcal</span>
              </div>
              <WeightChart key={period} data={chart} />
              <div className="flex gap-4 text-[11px] text-stone-500 mt-1 px-1">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-200/40 align-middle mr-1" />食べたチート（累計）</span>
                <span><span className="inline-block w-3 h-0.5 bg-stone-100 align-middle mr-1" />ならした線</span>
                <span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300/50 align-middle mr-1" />
                  {period === 'month' ? '毎日' : '週の平均'}
                </span>
              </div>
              {gap && (
                <p className="text-xs text-stone-400 mt-3">
                  目標ラインより{' '}
                  <span className={gap.ahead ? 'text-amber-400 font-bold' : 'text-stone-200 font-bold'}>
                    {Math.abs(gap.diffKg).toFixed(1)}kg {gap.ahead ? '先行' : '後ろ'}
                  </span>
                  {average.isReference && <span className="text-stone-600 ml-1">（参考値）</span>}
                </p>
              )}
            </section>

            {/* 入力（7日前まで） */}
            <section>
              <div className="flex items-center gap-1 text-stone-500 text-xs mb-2">
                <button
                  type="button"
                  disabled={prevDate < recordRange.min}
                  onClick={() => setViewDate(prevDate)}
                  aria-label="前の日"
                  className="px-1.5 text-base leading-none disabled:opacity-20"
                >
                  ‹
                </button>
                <span className={viewDate === today ? '' : 'text-amber-400'}>{formatMonthDayWeekday(viewDate)}</span>
                <button
                  type="button"
                  disabled={nextDate > recordRange.max}
                  onClick={() => setViewDate(nextDate)}
                  aria-label="次の日"
                  className="px-1.5 text-base leading-none disabled:opacity-20"
                >
                  ›
                </button>
                {viewDate !== today && (
                  <button type="button" onClick={() => setViewDate(today)} className="ml-auto text-amber-400">
                    今日に戻る
                  </button>
                )}
              </div>
              {userId && (
                <WeightEntryCard
                  key={viewDate}
                  userId={userId}
                  date={viewDate}
                  today={today}
                  log={byDate.get(viewDate) ?? null}
                  onSaved={upsertLocal}
                />
              )}
            </section>

            {/* 記録の一覧 */}
            <section className="bg-stone-900 rounded-3xl p-5">
              <h2 className="font-bold text-sm mb-4">記録</h2>
              {recent.length === 0 ? (
                <p className="text-stone-500 text-sm">まだ記録がありません</p>
              ) : (
                <ul className="space-y-1">
                  {recent.map((w) => {
                    const editable = isRecordableDate(w.measured_at, today)
                    return (
                      <li key={w.measured_at}>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => setViewDate(w.measured_at)}
                          className={`w-full flex items-center justify-between rounded-xl px-2 py-1.5 text-left ${
                            w.measured_at === viewDate ? 'bg-stone-800' : ''
                          }`}
                        >
                          <span className="text-stone-400 text-xs">
                            {formatMonthDayWeekday(w.measured_at)}
                            {w.waist_cm ? <span className="text-stone-600 ml-2">ウエスト {w.waist_cm}cm</span> : null}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-bold text-sm">{w.weight_kg}kg</span>
                            {editable && <span className="text-stone-600 text-xs">修正</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </main>
        )}
      </div>

      <BottomNav active="weight" />
    </div>
  )
}
