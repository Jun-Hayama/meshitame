'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import {
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  REDUCE_PACE_LABELS,
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  type ExerciseLogRow,
  type GoalPlanRow,
  type MealChoice,
  type MealLogRow,
  type MealSlot,
  type MonthlyWantRow,
  type WeightLog,
} from '@/types'
import {
  buildGaugeCheats,
  buildGaugeMarkers,
  calcDailyIntakeFromPace,
  calcPaceKgPerMonth,
  calcMealSlotTargets,
  calcMonthWeightChange,
  calcWeightAverage,
  calcMonthEarnedBreakdown,
  calcWeekSummary,
  calcZeroCalStatus,
  describeMonthWeightChange,
  describeWeekEarned,
  describeZeroCalHeadline,
  detectNewlyZeroed,
  expandCheatsForMonth,
  addDaysToDateStr,
  formatDateJST,
  formatMonthDayWeekday,
  getGaugeCheatName,
  getRecordableDateRange,
  getReplacedMealKeys,
  getReviewWeek,
  getWeekRange,
  orderZeroCalCheats,
} from '@/lib/calories'
import { TAMEMESHI_PT, WEIGHT_AVG_DAYS } from '@/lib/calorieConstants'
import { MealExamplesSheet } from '@/components/MealExamplesSheet'
import { CheatItemPicker } from '@/components/CheatItemPicker'
import { ExerciseSheet } from '@/components/ExerciseSheet'
import { WeightEntryCard } from '@/components/WeightEntryCard'
import { useReducePace } from '@/lib/reducePace'
import { useMilestones } from '@/lib/milestones'
import { MilestoneCards } from '@/components/MilestoneCards'
import { MonthMeshitameCard } from '@/components/MonthMeshitameCard'
import { WeekLine } from '@/components/WeekLine'
import { Toast } from '@/components/Toast'

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'morning', label: '朝' },
  { slot: 'lunch', label: '昼' },
  { slot: 'dinner', label: '夜' },
]

const CHOICES: MealChoice[] = ['light', 'normal', 'hearty']

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goal, setGoal] = useState<GoalPlanRow | null>(null)
  const [wants, setWants] = useState<MonthlyWantRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [mealLogs, setMealLogs] = useState<MealLogRow[]>([])
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLogRow[]>([])
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [showCheatPicker, setShowCheatPicker] = useState(false)
  const [showExercise, setShowExercise] = useState(false)
  const [exampleSlot, setExampleSlot] = useState<MealSlot | null>(null)
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  // メシため・うごためを記録する直前の貯まったpt（記録後に0kcal化を判定する。13.3）
  const ptBeforeRecord = useRef<number | null>(null)

  const today = formatDateJST(new Date())
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const monthStart = `${today.slice(0, 7)}-01`
  const recordRange = getRecordableDateRange(today)
  // 記録の読み込み範囲：月初と7日前の早い方〜今日（前月の日を表示しても記録が見えるように）
  const loadFrom = recordRange.min < monthStart ? recordRange.min : monthStart
  // 体重は、表示できる一番前の日の7日平均と、月初めからの変化（13.4）まで出せるように読む
  const weightFrom = addDaysToDateStr(recordRange.min, -(WEIGHT_AVG_DAYS - 1))
  const weightLoadFrom = weightFrom < loadFrom ? weightFrom : loadFrom

  // 表示中の日（7日前〜今日）。記録はこの日付で保存する
  const [viewDate, setViewDate] = useState(today)
  const isToday = viewDate === today

  useEffect(() => {
    async function load(userId: string) {
      const [
        { data: goalData, error: goalErr },
        { data: wantData, error: wantErr },
        { data: mealData, error: mealErr },
        { data: exerciseData, error: exerciseErr },
        { data: weightData, error: weightErr },
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
        supabase
          .from('weight_logs')
          .select('*')
          .eq('user_id', userId)
          .gte('measured_at', weightLoadFrom)
          .lte('measured_at', today),
      ])

      const missing = (e: { message: string; code?: string } | null) =>
        !!e && (e.message.includes('relation') || e.code === '42P01')
      if (goalErr) setError(goalErr.message)
      if (wantErr && !missing(wantErr)) setError(wantErr.message)
      if (mealErr && !missing(mealErr)) setError(mealErr.message)
      if (exerciseErr && !missing(exerciseErr)) setError(exerciseErr.message)
      if (weightErr) setError(weightErr.message)

      if (missing(wantErr) || missing(mealErr)) {
        setError('DBの migration_v2_monthly_wants.sql を Supabase で実行してください')
      } else if (missing(exerciseErr)) {
        setError('DBの migration_v2_1_cheats_exercise.sql を Supabase で実行してください')
      }

      // 有効な目標がなければ初回設定へ（読み込みエラーのときは留まってエラーを出す）
      if (!goalData && !goalErr) {
        router.replace('/setup')
        return
      }

      setGoal((goalData as GoalPlanRow) ?? null)
      setWants((wantData as MonthlyWantRow[]) || [])
      setMealLogs((mealData as MealLogRow[]) || [])
      setExerciseLogs((exerciseData as ExerciseLogRow[]) || [])
      setWeightLogs((weightData as WeightLog[]) || [])
      setLoading(false)
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      load(user.id)
    })
  }, [router, today, loadFrom, weightLoadFrom])

  // 1日の目安 = 必要量 − 減らすペース（12-3）。どの月も同じ
  const { pace, error: paceError } = useReducePace(userId)
  const dailyIntakeKcal = goal && pace ? calcDailyIntakeFromPace(goal.tdee, goal.bmr, pace) : null
  const slotTargets = useMemo(
    () => (dailyIntakeKcal === null ? [] : calcMealSlotTargets(dailyIntakeKcal)),
    [dailyIntakeKcal]
  )
  const exampleTarget = slotTargets.find((t) => t.slot === exampleSlot) ?? null

  // 「◯月のメシため」（常に今月）。チート = 登録したチート ＋ がっつり（12-2）を並び順に累計して0kcal化（13.3）
  const replacedMealKeys = useMemo(() => getReplacedMealKeys(wants), [wants])
  const orderedCheats = useMemo(
    () =>
      orderZeroCalCheats(
        buildGaugeCheats(expandCheatsForMonth(wants, year, month, slotTargets, today), mealLogs, year, month, replacedMealKeys)
      ),
    [wants, year, month, slotTargets, today, mealLogs, replacedMealKeys]
  )
  const earned = calcMonthEarnedBreakdown({ year, month, today, mealLogs, exerciseLogs, replacedMealKeys })
  const zeroCal = calcZeroCalStatus(orderedCheats, earned.totalPt)
  const monthWeightChange = calcMonthWeightChange(weightLogs, today)

  // 記録のあと、新たに0kcal化済みになったチートがあればトースト（複数なら最後の1件）
  // （記録が保存されて mealLogs / exerciseLogs が変わったあとに1回だけ判定する）
  useEffect(() => {
    const before = ptBeforeRecord.current
    if (before === null) return
    ptBeforeRecord.current = null
    const zeroed = detectNewlyZeroed(orderedCheats, before, earned.totalPt)
    if (zeroed) setToast(`${getGaugeCheatName(zeroed)}、なかったことに。`)
  }, [earned.totalPt, orderedCheats, exerciseLogs])

  // 週（月〜日）：「今週 +◯pt」。日曜は今週、月曜は先週の分を振り返り文に置き換える（13.5）
  const reviewWeek = getReviewWeek(today)
  const lineWeek = reviewWeek ?? getWeekRange(today)
  const weekSummary = calcWeekSummary({
    from: lineWeek.from,
    until: today,
    mealLogs,
    exerciseLogs,
    wants,
    slotTargets,
    weightLogs,
  })
  const weekLabel = reviewWeek
    ? describeWeekEarned(weekSummary.earned.totalPt)
    : `今週 +${weekSummary.earned.totalPt}pt`
  const viewLogs = mealLogs.filter((l) => l.log_date === viewDate)
  const viewWeight = weightLogs.find((w) => w.measured_at === viewDate) ?? null
  const viewAverage = calcWeightAverage(weightLogs, viewDate)
  const todayAverage = calcWeightAverage(weightLogs, today)
  const { milestones, dismiss: dismissMilestone } = useMilestones(goal, todayAverage)

  const nextWant = useMemo(() => {
    const upcoming = wants
      .filter((w) => w.scheduled_date && w.scheduled_date >= today)
      .sort((a, b) => (a.scheduled_date as string).localeCompare(b.scheduled_date as string))
    return upcoming[0] ?? null
  }, [wants, today])

  async function setMealChoice(slot: MealSlot, choice: MealChoice) {
    setSavingSlot(slot)
    ptBeforeRecord.current = earned.totalPt
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
      ptBeforeRecord.current = null
      setError(upErr.message)
      return
    }
    if (!data) {
      ptBeforeRecord.current = null
      return
    }
    const row = data as MealLogRow
    setMealLogs((prev) => {
      const rest = prev.filter((l) => !(l.log_date === row.log_date && l.slot === slot))
      return [...rest, row]
    })
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

  if (loading || (goal && !pace)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="text-amber-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  // 目標がないときはふつう /setup に移るので、ここに来るのは目標の読み込みに失敗したときだけ
  if (!goal) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center px-6 pb-24">
        <div className="max-w-sm mx-auto w-full text-center">
          <h1 className="text-3xl font-bold mb-3">
            <span className="text-amber-400">メシ</span>ため
          </h1>
          <p className="text-stone-500 text-sm mb-8">
            まず目標を置くと、今日の目安とメシためが使えます
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
          <button type="button" onClick={() => router.push('/settings')} className="text-stone-500 text-xs text-right">
            目安 {dailyIntakeKcal ?? '—'}kcal
            <br />
            {pace && (pace === 'keep' ? REDUCE_PACE_LABELS.keep : `${REDUCE_PACE_LABELS[pace]}（月${calcPaceKgPerMonth(pace)}kg）`)}
          </button>
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
        {paceError && <p className="text-rose-400 text-sm mb-4">{paceError}</p>}

        {/* ゲート達成・3%・5%（11-5） */}
        {milestones.length > 0 && (
          <div className="mb-6">
            <MilestoneCards milestones={milestones} onDismiss={dismissMilestone} />
          </div>
        )}

        {/* 今朝の体重（11-1） */}
        {userId && (
          <section className="mb-6">
            <WeightEntryCard
              key={viewDate}
              userId={userId}
              date={viewDate}
              today={today}
              log={viewWeight}
              compact
              onSaved={(row) =>
                setWeightLogs((prev) => [...prev.filter((w) => w.measured_at !== row.measured_at), row])
              }
            />
            {viewAverage.avgKg !== null && (
              <button type="button" onClick={() => router.push('/weight')} className="text-stone-500 text-xs mt-1.5 px-1">
                このところ <span className="text-stone-300">{viewAverage.avgKg.toFixed(1)}kg</span>前後
              </button>
            )}
          </section>
        )}

        {/* 今日の目安 */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-stone-300 mb-3">{isToday ? '今日の目安' : 'この日の目安'}</h2>
          <ul className="grid grid-cols-3 gap-2">
            {slotTargets.map((t) => (
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
                    {CHOICES.map((choice) => (
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
                        {MEAL_CHOICE_EMOJI[choice]} {MEAL_CHOICE_LABELS[choice]}
                        {choice === 'light' && (
                          <span className="block text-[10px] opacity-80">+{TAMEMESHI_PT}pt</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ◯月のメシため（13.3）と今週の行（13.5） */}
        <section className="mb-8">
          <MonthMeshitameCard
            month={month}
            status={zeroCal}
            markers={buildGaugeMarkers(zeroCal)}
            headline={describeZeroCalHeadline(zeroCal)}
            earned={earned}
            weightLine={monthWeightChange === null ? null : describeMonthWeightChange(monthWeightChange)}
            onAddExercise={() => setShowExercise(true)}
            onAddCheat={() => setShowCheatPicker(true)}
          />
          <WeekLine summary={weekSummary} label={weekLabel} />
          <button type="button" onClick={() => router.push('/wants')} className="text-amber-400 text-xs mt-3 px-1">
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
            ptBeforeRecord.current = earned.totalPt
            setExerciseLogs((prev) => [...prev, row])
          }}
        />
      )}

      {exampleTarget && (
        <MealExamplesSheet target={exampleTarget} onClose={() => setExampleSlot(null)} />
      )}

      {toast && <Toast message={toast} onDone={clearToast} />}

      <BottomNav active="home" />
    </div>
  )
}
