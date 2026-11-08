'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import {
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  type ExerciseLogRow,
  type GoalPlanRow,
  type MealChoice,
  type MealLogRow,
  type MealSlot,
  type MonthlyWantRow,
} from '@/types'
import {
  calcMealSlotTargets,
  calcCurrentMonthTargets,
  calcMeshipoGauge,
  calcMonthEarnedPt,
  expandCheatsForMonth,
  addDaysToDateStr,
  dateStrToJSTDate,
  formatDateJST,
  formatMonthDayWeekday,
  getDaysInMonth,
  getRecordableDateRange,
  getReplacedMealKeys,
  sumMonthCheatCosts,
} from '@/lib/calories'
import { MEAL_RECORD_DELTA } from '@/lib/calorieConstants'
import { MealExamplesSheet } from '@/components/MealExamplesSheet'
import { CheatItemPicker } from '@/components/CheatItemPicker'
import { ExerciseSheet } from '@/components/ExerciseSheet'

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
  const [userId, setUserId] = useState<string | null>(null)
  const [mealLogs, setMealLogs] = useState<MealLogRow[]>([])
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLogRow[]>([])
  const [showCheatPicker, setShowCheatPicker] = useState(false)
  const [showExercise, setShowExercise] = useState(false)
  const [exampleSlot, setExampleSlot] = useState<MealSlot | null>(null)
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null)

  const today = formatDateJST(new Date())
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const dayOfMonth = Number(today.slice(8, 10))
  const monthStart = `${today.slice(0, 7)}-01`
  const recordRange = getRecordableDateRange(today)
  // 記録の読み込み範囲：月初と7日前の早い方〜今日（前月の日を表示しても記録が見えるように）
  const loadFrom = recordRange.min < monthStart ? recordRange.min : monthStart

  // 表示中の日（7日前〜今日）。記録はこの日付で保存する
  const [viewDate, setViewDate] = useState(today)
  const isToday = viewDate === today

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

    const [
      { data: goalData, error: goalErr },
      { data: wantData, error: wantErr },
      { data: mealData, error: mealErr },
      { data: exerciseData, error: exerciseErr },
    ] = await Promise.all([
      supabase.from('goal_plans').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle(),
      supabase.from('monthly_wants').select('*').eq('user_id', userId).eq('is_active', true),
      supabase
        .from('meal_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('log_date', loadFrom)
        .lte('log_date', today),
      supabase
        .from('exercise_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('log_date', loadFrom)
        .lte('log_date', today),
    ])

    const missing = (e: { message: string; code?: string } | null) =>
      !!e && (e.message.includes('relation') || e.code === '42P01')
    if (goalErr) setError(goalErr.message)
    if (wantErr && !missing(wantErr)) setError(wantErr.message)
    if (mealErr && !missing(mealErr)) setError(mealErr.message)
    if (exerciseErr && !missing(exerciseErr)) setError(exerciseErr.message)

    if (missing(wantErr) || missing(mealErr)) {
      setError('DBの migration_v2_monthly_wants.sql を Supabase で実行してください')
    } else if (missing(exerciseErr)) {
      setError('DBの migration_v2_1_cheats_exercise.sql を Supabase で実行してください')
    }

    setGoal((goalData as GoalPlanRow) ?? null)
    setWants((wantData as MonthlyWantRow[]) || [])
    setMealLogs((mealData as MealLogRow[]) || [])
    setExerciseLogs((exerciseData as ExerciseLogRow[]) || [])
    setLoading(false)
  }

  // 今月の目安（メシポゲージのコスト計算用）
  const monthTargets = useMemo(
    () => (goal ? calcCurrentMonthTargets(goal, new Date()) : null),
    [goal]
  )
  const slotTargets = useMemo(
    () => (monthTargets ? calcMealSlotTargets(monthTargets.dailyIntakeKcal) : []),
    [monthTargets]
  )

  // 表示中の日の月の目安（前月の日を表示しているときは前月の値）
  const viewTargets = useMemo(
    () => (goal ? calcCurrentMonthTargets(goal, dateStrToJSTDate(viewDate)) : null),
    [goal, viewDate]
  )
  const viewSlotTargets = useMemo(
    () => (viewTargets ? calcMealSlotTargets(viewTargets.dailyIntakeKcal) : []),
    [viewTargets]
  )
  const exampleTarget = viewSlotTargets.find((t) => t.slot === exampleSlot) ?? null

  // メシポゲージ（月で1本・常に今月）
  const cheatEntries = useMemo(
    () => expandCheatsForMonth(wants, year, month, slotTargets, today),
    [wants, year, month, slotTargets, today]
  )
  const replacedMealKeys = useMemo(() => getReplacedMealKeys(wants), [wants])
  const gauge = calcMeshipoGauge({
    targetPt: sumMonthCheatCosts(cheatEntries),
    earnedPt: calcMonthEarnedPt({ year, month, today, mealLogs, exerciseLogs, replacedMealKeys }),
    dayOfMonth,
    daysInMonth: getDaysInMonth(year, month),
  })
  const viewLogs = mealLogs.filter((l) => l.log_date === viewDate)

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
        { user_id: user.id, log_date: viewDate, slot, choice },
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
      setMealLogs((prev) => {
        const rest = prev.filter((l) => !(l.log_date === row.log_date && l.slot === slot))
        return [...rest, row]
      })
    }
  }

  function choiceFor(slot: MealSlot): MealChoice | null {
    return viewLogs.find((l) => l.slot === slot)?.choice ?? null
  }

  // 表示中の日にその食事を置き換えたチート（あれば3択の代わりに「★チート」）
  function replacingCheat(slot: MealSlot): MonthlyWantRow | null {
    if (!replacedMealKeys.has(`${viewDate}:${slot}`)) return null
    return (
      wants.find(
        (w) => w.scheduled_date === viewDate && w.cheat_type === 'replace' && (w.replace_slot ?? 'dinner') === slot
      ) ?? null
    )
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
            まず目標を置くと、今日の目安とメシポゲージが使えます
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

  const prevDate = addDaysToDateStr(viewDate, -1)
  const nextDate = addDaysToDateStr(viewDate, 1)
  const canPrev = prevDate >= recordRange.min
  const canNext = nextDate <= recordRange.max

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1 text-stone-500 text-xs mb-1">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => setViewDate(prevDate)}
                aria-label="前の日"
                className="px-1.5 text-base leading-none disabled:opacity-20"
              >
                ‹
              </button>
              <span className={isToday ? '' : 'text-amber-400'}>{formatMonthDayWeekday(viewDate)}</span>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => setViewDate(nextDate)}
                aria-label="次の日"
                className="px-1.5 text-base leading-none disabled:opacity-20"
              >
                ›
              </button>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-amber-400">メシ</span>ため
            </h1>
          </div>
          <p className="text-stone-500 text-xs text-right">
            目安 {viewTargets?.dailyIntakeKcal ?? '—'}kcal
            <br />
            貯金 {viewTargets?.dailySaving.savingKcal ?? '—'}kcal/日
          </p>
        </header>

        {!isToday && (
          <div className="flex items-center justify-between bg-amber-400/10 border border-amber-400/30 rounded-2xl px-4 py-2.5 mb-6">
            <p className="text-amber-400 text-sm font-medium">{formatMonthDayWeekday(viewDate)}を表示中</p>
            <button
              type="button"
              onClick={() => setViewDate(today)}
              className="bg-amber-400 text-stone-950 font-bold text-xs px-3 py-1.5 rounded-full"
            >
              今日に戻る
            </button>
          </div>
        )}

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {/* 今日の目安 */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-stone-300 mb-3">{isToday ? '今日の目安' : 'この日の目安'}</h2>
          <ul className="grid grid-cols-3 gap-2">
            {viewSlotTargets.map((t) => (
              <li key={t.slot} className="bg-stone-900 rounded-2xl px-3 py-3 relative">
                <button
                  type="button"
                  onClick={() => setExampleSlot(t.slot)}
                  aria-label={`${t.label}のメニュー例`}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-stone-800 text-stone-400 text-xs"
                >
                  ?
                </button>
                <p className="text-sm font-medium mb-1">{t.label}</p>
                <p className="text-stone-400 text-xs">目安 ≒ {t.kcal}kcal</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 3択記録 */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-stone-300 mb-3">{isToday ? '今日の記録' : 'この日の記録'}</h2>
          <div className="space-y-3">
            {SLOTS.map(({ slot, label }) => {
              const selected = choiceFor(slot)
              const cheat = replacingCheat(slot)
              if (cheat) {
                return (
                  <div key={slot} className="bg-amber-400/10 border border-amber-400/30 rounded-2xl px-4 py-3">
                    <p className="text-sm font-medium mb-1">{label}</p>
                    <p className="text-amber-400 text-sm font-bold">
                      ★チート <span className="font-normal">{cheat.label || WANT_KIND_LABELS[cheat.kind]}</span>
                    </p>
                  </div>
                )
              }
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

        {/* メシポゲージ（月で1本） */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-300">{month}月のメシポゲージ</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowExercise(true)}
                className="bg-stone-800 text-amber-400 font-bold text-xs px-3 py-1.5 rounded-full"
              >
                ＋運動
              </button>
              <button
                type="button"
                onClick={() => setShowCheatPicker(true)}
                className="bg-amber-400 text-stone-950 font-bold text-xs px-3 py-1.5 rounded-full"
              >
                ＋チート
              </button>
            </div>
          </div>

          <div className="bg-stone-900 rounded-2xl px-4 py-4 mb-3">
            <p className="text-sm mb-3">
              メシポ <span className="text-amber-400 text-xl font-bold">{gauge.earnedPt}</span>
              <span className="text-stone-500"> / {gauge.targetPt}pt</span>
            </p>
            <div className="relative h-3 bg-stone-800 rounded-full mb-2">
              <div
                className="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
                style={{ width: `${gauge.fillRatio * 100}%` }}
              />
              {gauge.targetPt > 0 && (
                <div
                  className="absolute -top-1 -bottom-1 w-0.5 bg-stone-100"
                  style={{ left: `${gauge.paceRatio * 100}%` }}
                  aria-label={`ペースの目印 ${gauge.pacePt}pt`}
                />
              )}
            </div>
            {gauge.targetPt > 0 && (
              <p className="text-xs text-stone-400">
                {gauge.extraPt > 0 ? (
                  <span className="text-amber-400">あと{gauge.extraPt}pt分、追加でチートできる！</span>
                ) : gauge.onPace ? (
                  <span className="text-amber-400">ペースどおり</span>
                ) : (
                  <>
                    あと{gauge.behindPt}ptでペースに追いつく
                    <span className="block text-stone-500 mt-0.5">
                      今日{gauge.catchUpWalkingMinutes}分歩くとペースに追いつく
                    </span>
                  </>
                )}
              </p>
            )}
            <p className="text-stone-500 text-xs mt-2">
              {gauge.lightMealsNeeded === 0 ? '今月は軽めなしでOK' : `今月あと軽め${gauge.lightMealsNeeded}回`}
            </p>
          </div>

          {cheatEntries.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowCheatPicker(true)}
              className="w-full bg-stone-900 rounded-2xl px-4 py-6 text-center"
            >
              <p className="text-stone-400 text-sm mb-1">まだ今月のチートがありません</p>
              <p className="text-amber-400 text-xs">タップして追加</p>
            </button>
          ) : (
            <ul className="space-y-1.5">
              {cheatEntries.map((e) => {
                const name = e.row.label || WANT_KIND_LABELS[e.row.kind]
                const done = e.mode === 'dated' && e.done
                return (
                  <li
                    key={e.row.id}
                    className={`flex items-center justify-between bg-stone-900 rounded-xl px-3 py-2 ${done ? 'opacity-50' : ''}`}
                  >
                    <span className="text-sm min-w-0 truncate">
                      <span className="text-stone-500 text-xs mr-2">
                        {e.mode === 'dated'
                          ? e.date.slice(5).replace('-', '/')
                          : `週${e.timesPerWeek}回（今月${e.timesInMonth}回分）`}
                      </span>
                      {WANT_KIND_EMOJI[e.row.kind]} {name}
                    </span>
                    <span className="text-xs shrink-0 ml-2">
                      {done ? <span className="text-amber-400">★済み</span> : <span className="text-stone-500">{e.costPt}pt</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <button type="button" onClick={() => router.push('/wants')} className="text-amber-400 text-xs mt-3">
            チートの一覧・編集
          </button>
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

      {showCheatPicker && userId && (
        <CheatItemPicker
          userId={userId}
          goal={goal}
          initialDate={viewDate}
          onClose={() => setShowCheatPicker(false)}
          onSaved={(row) => {
            setShowCheatPicker(false)
            setWants((prev) => [...prev, row])
          }}
        />
      )}

      {showExercise && userId && (
        <ExerciseSheet
          userId={userId}
          logDate={viewDate}
          onClose={() => setShowExercise(false)}
          onSaved={(row) => {
            setShowExercise(false)
            setExerciseLogs((prev) => [...prev, row])
          }}
        />
      )}

      {exampleTarget && (
        <MealExamplesSheet target={exampleTarget} onClose={() => setExampleSlot(null)} />
      )}

      <BottomNav active="home" />
    </div>
  )
}
