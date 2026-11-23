'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import {
  EXERCISE_EMOJI,
  EXERCISE_LABEL,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  REDUCE_PACE_LABELS,
  type ExerciseLogRow,
  type GoalPlanRow,
  type MealChoice,
  type MealLogRow,
  type MealSlot,
  type MonthCheatStatus,
  type MonthlyWantRow,
  type WeightLog,
} from '@/types'
import {
  calcDailyIntakeFromPace,
  calcPaceKgPerMonth,
  calcMealSlotTargets,
  calcMonthCheatStatus,
  calcWeightAverage,
  describeExerciseToast,
  describeMeshitameToast,
  detectNewlyCleared,
  addDaysToDateStr,
  formatDateJST,
  formatMonthDayWeekday,
  getCheatItemEmojis,
  getCheatName,
  getCheatPlace,
  getCheatRowEmoji,
  getRecordableDateRange,
  isWeightRisingThreeWeeks,
  shouldShowWeightReassurance,
} from '@/lib/calories'
import {
  WEIGHT_AVG_DAYS,
  WEIGHT_REASSURE_MESSAGE,
  WEIGHT_REASSURE_TOAST_MS,
  WEIGHT_RISING_WEEKS,
} from '@/lib/calorieConstants'
import { MealExamplesSheet } from '@/components/MealExamplesSheet'
import { CheatItemPicker, type CheatPickerTarget } from '@/components/CheatItemPicker'
import { ExerciseSheet } from '@/components/ExerciseSheet'
import { WeightEntryCard } from '@/components/WeightEntryCard'
import { useReducePace } from '@/lib/reducePace'
import { useMilestones } from '@/lib/milestones'
import { MilestoneCards } from '@/components/MilestoneCards'
import { MonthMeshitameCard } from '@/components/MonthMeshitameCard'
import { Toast } from '@/components/Toast'

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'morning', label: '朝' },
  { slot: 'lunch', label: '昼' },
  { slot: 'dinner', label: '夜' },
]

const CHOICES: MealChoice[] = ['light', 'normal', 'hearty']

type PickerState = { target: CheatPickerTarget; editing: MonthlyWantRow | null; canRemove: boolean }

// 「食事のほかに」のチップ：品が1つなら「🍺×2」「🍰ケーキ」、2つ以上なら絵文字と名前
function extraChipLabel(row: MonthlyWantRow): string {
  const items = row.items ?? []
  if (items.length === 1) return `${getCheatRowEmoji(row)}${items[0].qty > 1 ? `×${items[0].qty}` : items[0].name}`
  return `${getCheatItemEmojis([row])}${row.label ?? ''}`
}

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
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [showExercise, setShowExercise] = useState(false)
  const [exampleSlot, setExampleSlot] = useState<MealSlot | null>(null)
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null)
  // チートが入っている食事で🐷・🍚を押したときの確認（16章 3-1）
  const [confirmSwitch, setConfirmSwitch] = useState<{ slot: MealSlot; choice: MealChoice; name: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; durationMs?: number } | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const today = formatDateJST(new Date())
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const recordRange = getRecordableDateRange(today)
  // 記録の読み込み範囲：前月の初日〜今日（持ち越し（16章）と、7日前までの表示のため）
  const prevMonthStart = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`
  const loadFrom = prevMonthStart
  // 体重は、表示できる一番前の日の前日までの7日平均（15.3）と、今日・7日前・14日前の前週比（15.3）まで出せるように読む
  const weightFrom = addDaysToDateStr(today, -(WEIGHT_AVG_DAYS * WEIGHT_RISING_WEEKS + WEIGHT_AVG_DAYS - 1))
  const weightLoadFrom = weightFrom < recordRange.min ? weightFrom : recordRange.min

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
        supabase.from('meal_logs').select('*').eq('user_id', userId).gte('log_date', loadFrom).lte('log_date', today),
        supabase.from('exercise_logs').select('*').eq('user_id', userId).gte('log_date', loadFrom).lte('log_date', today),
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

  // ◯月のチート（16章。常に今月）
  const statusFor = useCallback(
    (w: MonthlyWantRow[], meals: MealLogRow[], exercises: ExerciseLogRow[]): MonthCheatStatus =>
      calcMonthCheatStatus({ year, month, today, wants: w, mealLogs: meals, exerciseLogs: exercises, slotTargets }),
    [year, month, today, slotTargets]
  )
  const status = useMemo(() => statusFor(wants, mealLogs, exerciseLogs), [statusFor, wants, mealLogs, exerciseLogs])

  // 記録のあと：新たになかったことになったチートがあれば「{チート名}、なかったことに。」、なければ fallback
  function applyChange(
    next: { wants?: MonthlyWantRow[]; meals?: MealLogRow[]; exercises?: ExerciseLogRow[] },
    fallback?: string
  ) {
    const w = next.wants ?? wants
    const meals = next.meals ?? mealLogs
    const exercises = next.exercises ?? exerciseLogs
    const cleared = detectNewlyCleared(status, statusFor(w, meals, exercises))
    setWants(w)
    setMealLogs(meals)
    setExerciseLogs(exercises)
    if (cleared) setToast({ message: `${getCheatName(cleared)}、なかったことに。` })
    else if (fallback) setToast({ message: fallback })
  }

  const viewLogs = mealLogs.filter((l) => l.log_date === viewDate)
  const viewWeight = weightLogs.find((w) => w.measured_at === viewDate) ?? null
  const viewAverage = calcWeightAverage(weightLogs, viewDate)
  const todayAverage = calcWeightAverage(weightLogs, today)
  const { milestones, dismiss: dismissMilestone } = useMilestones(goal, todayAverage)

  // 表示中の日の、その食事のチート（品つき）と「食事のほかに」のチート
  const viewCheats = wants.filter((w) => w.scheduled_date === viewDate)
  const mealCheatRows = (slot: MealSlot) => viewCheats.filter((w) => getCheatPlace(w) === slot)
  const extraRows = viewCheats
    .filter((w) => getCheatPlace(w) === 'extra')
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const logFor = (slot: MealSlot) => viewLogs.find((l) => l.slot === slot) ?? null

  // 🔥チートが選ばれた状態：がっつり（hearty）の記録か、その食事のチートがあるとき
  function choiceFor(slot: MealSlot): MealChoice | null {
    if (mealCheatRows(slot).length > 0) return 'hearty'
    return logFor(slot)?.choice ?? null
  }

  async function currentUserId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) router.push('/login')
    return user?.id ?? null
  }

  // meal_logs に1件保存して、新しい記録の一覧を返す
  async function upsertMealLog(slot: MealSlot, choice: MealChoice): Promise<MealLogRow[] | null> {
    const uid = await currentUserId()
    if (!uid) return null
    const { data, error: upErr } = await supabase
      .from('meal_logs')
      .upsert({ user_id: uid, log_date: viewDate, slot, choice }, { onConflict: 'user_id,log_date,slot' })
      .select()
      .maybeSingle()
    if (upErr) {
      setError(upErr.message)
      return null
    }
    if (!data) return null
    const row = data as MealLogRow
    return [...mealLogs.filter((l) => !(l.log_date === row.log_date && l.slot === slot)), row]
  }

  // その食事のチート（品つき）を外す
  async function deactivateMealCheats(slot: MealSlot): Promise<MonthlyWantRow[] | null> {
    const ids = mealCheatRows(slot).map((w) => w.id)
    if (ids.length === 0) return wants
    const { error: upErr } = await supabase.from('monthly_wants').update({ is_active: false }).in('id', ids)
    if (upErr) {
      setError(upErr.message)
      return null
    }
    return wants.filter((w) => !ids.includes(w.id))
  }

  function chooseMeal(slot: MealSlot, choice: MealChoice) {
    if (choice === 'hearty') {
      const rows = mealCheatRows(slot)
      setPicker({
        target: { kind: 'meal', date: viewDate, slot },
        editing: rows[0] ?? null,
        canRemove: choiceFor(slot) === 'hearty',
      })
      return
    }
    if (choiceFor(slot) === 'hearty') {
      const rows = mealCheatRows(slot)
      const label = SLOTS.find((s) => s.slot === slot)?.label
      setConfirmSwitch({ slot, choice, name: rows[0]?.label || `${label}のチート` })
      return
    }
    saveMealChoice(slot, choice)
  }

  async function saveMealChoice(slot: MealSlot, choice: MealChoice, nextWants?: MonthlyWantRow[]) {
    setSavingSlot(slot)
    const meals = await upsertMealLog(slot, choice)
    setSavingSlot(null)
    if (!meals) return
    applyChange({ wants: nextWants, meals }, choice === 'light' ? describeMeshitameToast() : undefined)
  }

  // 書き換え：チートを取り消してから、押したほうで記録する
  async function confirmSwitchChoice() {
    if (!confirmSwitch) return
    const { slot, choice } = confirmSwitch
    setConfirmSwitch(null)
    setSavingSlot(slot)
    const nextWants = await deactivateMealCheats(slot)
    setSavingSlot(null)
    if (!nextWants) return
    await saveMealChoice(slot, choice, nextWants)
  }

  // 🔥チートを保存：品つきの行（picker が保存）＋ meal_logs の hearty
  async function handleMealCheatSaved(slot: MealSlot, row: MonthlyWantRow | null, editing: MonthlyWantRow | null) {
    setPicker(null)
    let nextWants = wants.filter((w) => w.id !== editing?.id && w.id !== row?.id)
    if (row) nextWants = [...nextWants, row]
    const meals = await upsertMealLog(slot, 'hearty')
    if (!meals) {
      setWants(nextWants)
      return
    }
    applyChange({ wants: nextWants, meals })
  }

  // 🔥チートを取り消す：その食事のチートと hearty の記録を消す（記録なし = いつもの）
  async function handleMealCheatRemoved(slot: MealSlot) {
    setPicker(null)
    const nextWants = await deactivateMealCheats(slot)
    if (!nextWants) return
    const log = logFor(slot)
    let meals = mealLogs
    if (log) {
      const { error: delErr } = await supabase.from('meal_logs').delete().eq('id', log.id)
      if (delErr) {
        setError(delErr.message)
        setWants(nextWants)
        return
      }
      meals = mealLogs.filter((l) => l.id !== log.id)
    }
    applyChange({ wants: nextWants, meals })
  }

  function openExtra(date: string, editing: MonthlyWantRow | null = null) {
    setPicker({ target: { kind: 'extra', date }, editing, canRemove: !!editing })
  }

  // 体重を保存したら、上がった日のひと言（15.3）
  function handleWeightSaved(row: WeightLog) {
    const next = [...weightLogs.filter((w) => w.measured_at !== row.measured_at), row]
    setWeightLogs(next)
    const show = shouldShowWeightReassurance({
      logs: next,
      date: row.measured_at,
      weightKg: Number(row.weight_kg),
      onPace: status.onTrack,
      risingThreeWeeks: isWeightRisingThreeWeeks(next, today),
    })
    if (show) setToast({ message: WEIGHT_REASSURE_MESSAGE, durationMs: WEIGHT_REASSURE_TOAST_MS })
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
            まず目標を決めると、今日の目安とメシためが使えます
          </p>
          <button
            type="button"
            onClick={() => router.push('/setup')}
            className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
          >
            目標を決める
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
  const pickerSlot = picker?.target.kind === 'meal' ? picker.target.slot : null

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

        {/* 目標体重・3%・5%（11-5） */}
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
              onSaved={handleWeightSaved}
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

        {/* 食事の記録（16章 3-1） */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-stone-300 mb-3">{isToday ? '今日の記録' : 'この日の記録'}</h2>
          <div className="space-y-3">
            {SLOTS.map(({ slot, label }) => {
              const selected = choiceFor(slot)
              const emojis = getCheatItemEmojis(mealCheatRows(slot))
              return (
                <div key={slot} className="bg-stone-900 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <p className="text-sm font-medium w-5 shrink-0">{label}</p>
                  <div className="flex gap-2 flex-1 min-w-0">
                    {CHOICES.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        disabled={savingSlot === slot}
                        onClick={() => chooseMeal(slot, choice)}
                        className={`flex-1 min-w-0 py-2 rounded-xl text-xs truncate ${
                          selected === choice ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                        }`}
                      >
                        {MEAL_CHOICE_EMOJI[choice]}
                        {MEAL_CHOICE_LABELS[choice]}
                        {choice === 'hearty' && selected === 'hearty' && emojis && (
                          <span className="ml-1 text-[11px]">{emojis}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* 食事のほかに */}
            <div className="bg-stone-900 rounded-2xl px-4 py-3 flex items-center gap-2">
              <p className="text-sm font-medium shrink-0 mr-1">食事のほかに</p>
              <div className="flex gap-1.5 flex-1 min-w-0 overflow-x-auto">
                {extraRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openExtra(viewDate, row)}
                    className="shrink-0 bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/40 rounded-full px-2.5 py-1 text-xs"
                  >
                    {extraChipLabel(row)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => openExtra(viewDate)}
                aria-label="食事のほかにチートを足す"
                className="shrink-0 w-8 h-8 rounded-full bg-stone-800 text-amber-400 text-lg leading-none"
              >
                ＋
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowExercise(true)}
              className="bg-stone-800 text-amber-400 font-bold text-xs px-4 py-2 rounded-full"
            >
              {EXERCISE_EMOJI}＋{EXERCISE_LABEL}
            </button>
          </div>
        </section>

        {/* ◯月のチート（16章 3-2） */}
        <section className="mb-8">
          <MonthMeshitameCard
            month={month}
            status={status}
            onOpenLog={() => router.push('/log')}
            onEatToday={() => {
              setViewDate(today)
              openExtra(today)
            }}
            onPlan={() => router.push('/wants?add=1')}
          />
        </section>
      </div>

      {picker && userId && (
        <CheatItemPicker
          key={`${picker.target.kind}:${picker.target.date}:${pickerSlot ?? ''}:${picker.editing?.id ?? ''}`}
          userId={userId}
          goal={goal}
          today={today}
          target={picker.target}
          editing={picker.editing}
          canRemove={picker.canRemove}
          onClose={() => setPicker(null)}
          onSaved={(row) => {
            if (pickerSlot) {
              handleMealCheatSaved(pickerSlot, row, picker.editing)
              return
            }
            setPicker(null)
            if (row) applyChange({ wants: [...wants.filter((w) => w.id !== row.id), row] })
          }}
          onRemoved={() => {
            if (pickerSlot) {
              handleMealCheatRemoved(pickerSlot)
              return
            }
            const id = picker.editing?.id
            setPicker(null)
            applyChange({ wants: wants.filter((w) => w.id !== id) })
          }}
        />
      )}

      {confirmSwitch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setConfirmSwitch(null)}>
          <div className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-1">{confirmSwitch.name}を取り消しますか？</p>
            <p className="text-stone-500 text-xs mb-4">
              取り消して「{MEAL_CHOICE_EMOJI[confirmSwitch.choice]}{MEAL_CHOICE_LABELS[confirmSwitch.choice]}」で記録します
            </p>
            <button
              type="button"
              onClick={confirmSwitchChoice}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
            >
              取り消して記録する
            </button>
            <button type="button" onClick={() => setConfirmSwitch(null)} className="w-full mt-3 py-3 text-stone-500 text-sm">
              やめる
            </button>
          </div>
        </div>
      )}

      {showExercise && userId && (
        <ExerciseSheet
          userId={userId}
          logDate={viewDate}
          onClose={() => setShowExercise(false)}
          onSaved={(row) => {
            setShowExercise(false)
            applyChange({ exercises: [...exerciseLogs, row] }, describeExerciseToast(row))
          }}
        />
      )}

      {exampleTarget && <MealExamplesSheet target={exampleTarget} onClose={() => setExampleSlot(null)} />}

      {toast && <Toast message={toast.message} durationMs={toast.durationMs} onDone={clearToast} />}

      <BottomNav active="home" />
    </div>
  )
}
