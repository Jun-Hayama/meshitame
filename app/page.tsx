'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import {
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  type CheatHints,
  type ExerciseLogRow,
  type ExerciseType,
  type GoalPlanRow,
  type MealChoice,
  type MealLogRow,
  type MealSlot,
  type MonthCheatStatus,
  type MonthlyWantRow,
  type QuickExercise,
  type RecordToastInput,
  type WeightLog,
} from '@/types'
import {
  calcDailyIntakeFromPace,
  calcExercisePoints,
  calcMealSlotTargets,
  calcMonthWeightChange,
  describeDayExercises,
  calcMonthCheatStatus,
  getCheatLoadFrom,
  calcWeightAverage,
  calcWaterRetention,
  describeRecordToast,
  describeWaterReturnToast,
  describeWaterTodayLine,
  listWaterHeavyDays,
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
  pickFrequentExercises,
  shouldShowWeightReassurance,
} from '@/lib/calories'
import {
  WEIGHT_AVG_DAYS,
  WEIGHT_REASSURE_MESSAGE,
  WEIGHT_REASSURE_TOAST_MS,
  WEIGHT_RISING_WEEKS,
  WATER_TOAST_MS,
  UNDO_TOAST_MS,
  MESHITAME_SECTION_NOTE,
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
import { CheatHintSheet } from '@/components/CheatHintSheet'
import { QuickExerciseRow } from '@/components/QuickExerciseRow'
import { FriendCard } from '@/components/FriendCard'
import {
  INVITE_RETURN_QUERY,
  clearPendingJoinToken,
  joinPath,
  readPendingJoinToken,
  scheduleFriendSync,
  syncFriendDataIfStale,
} from '@/lib/friends'

const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: 'morning', label: '朝' },
  { slot: 'lunch', label: '昼' },
  { slot: 'dinner', label: '夜' },
]

const CHOICES: MealChoice[] = ['light', 'normal', 'hearty']

type PickerState = { target: CheatPickerTarget; editing: MonthlyWantRow | null; canRemove: boolean }

// 「追加チート」のチップ：品が1つなら「🍺×2」「🍰ケーキ」、2つ以上なら絵文字と名前
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
  // うごための画面（initial：カードの［記録する］から開くときの種類・時間）
  const [exerciseSheet, setExerciseSheet] = useState<{ initial?: { type: ExerciseType; minutes: number } } | null>(null)
  const [showTargets, setShowTargets] = useState(false)
  const [hints, setHints] = useState<CheatHints | null>(null)
  // 登録の確認メールを別のブラウザで開いて、誘いのトークンが見つからなかったとき（18章）
  const [lostInvite, setLostInvite] = useState(false)
  const [savingExercise, setSavingExercise] = useState(false)
  const [savingSlot, setSavingSlot] = useState<MealSlot | null>(null)
  // チートが入っている食事で🐷・🍚を押したときの確認（16章 3-1）
  const [confirmSwitch, setConfirmSwitch] = useState<{ slot: MealSlot; choice: MealChoice; name: string } | null>(null)
  const [toast, setToast] = useState<{
    message: string
    durationMs?: number
    action?: { label: string; onClick: () => void }
  } | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const today = formatDateJST(new Date())
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const recordRange = getRecordableDateRange(today)
  // 記録の読み込み範囲：持ち越し（16-追記 v2.6.1）のためにさかのぼる月の初日〜今日（7日前までの表示もこの中）
  const loadFrom = getCheatLoadFrom(year, month)
  // 体重は、表示できる一番前の日の前日までの7日平均（15.3）と、今日・7日前・14日前の前週比（15.3）まで出せるように読む
  const weightFrom = addDaysToDateStr(today, -(WEIGHT_AVG_DAYS * WEIGHT_RISING_WEEKS + WEIGHT_AVG_DAYS - 1))
  // カードの「月初めから◯kg減」（13.4）のため、月の初日からも読む
  const monthStart = `${today.slice(0, 7)}-01`
  const weightLoadFrom = [weightFrom, recordRange.min, monthStart].reduce((a, b) => (a < b ? a : b))

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
      // 誘いのリンクから登録・ログインしてきたら、参加のページへ戻す（18章）
      const token = readPendingJoinToken()
      const path = token ? joinPath(token) : null
      if (path) {
        clearPendingJoinToken()
        router.replace(path)
        return
      }
      if (window.location.search.includes(INVITE_RETURN_QUERY)) {
        setLostInvite(true)
        window.history.replaceState(null, '', '/')
      }
      setUserId(user.id)
      load(user.id)
      syncFriendDataIfStale(user.id)
    })
  }, [router, today, loadFrom, weightLoadFrom])

  // 1日の目安 = 必要量 − 減らすペース（12-3）。どの月も同じ
  const { pace, error: paceError } = useReducePace(userId)
  const dailyIntakeKcal = goal && pace ? calcDailyIntakeFromPace(goal.tdee, goal.bmr, pace) : null
  const slotTargets = useMemo(
    () => (dailyIntakeKcal === null ? [] : calcMealSlotTargets(dailyIntakeKcal)),
    [dailyIntakeKcal]
  )

  // ◯月のチート（16章。常に今月）
  const statusFor = useCallback(
    (w: MonthlyWantRow[], meals: MealLogRow[], exercises: ExerciseLogRow[]): MonthCheatStatus =>
      calcMonthCheatStatus({ year, month, today, wants: w, mealLogs: meals, exerciseLogs: exercises, slotTargets }),
    [year, month, today, slotTargets]
  )
  const status = useMemo(() => statusFor(wants, mealLogs, exerciseLogs), [statusFor, wants, mealLogs, exerciseLogs])

  // カードの換算の行の体重の部分（13.4。今日までの月初めからの変化）
  const monthWeightDiffKg = useMemo(() => calcMonthWeightChange(weightLogs, today), [weightLogs, today])

  // いつものうごため（16-追記 v2.6.3）：直近30日によく記録したもの2つ
  const quickExercises = useMemo(() => pickFrequentExercises(exerciseLogs, today), [exerciseLogs, today])

  // 記録のあとのトースト（1つだけ）
  // メシため・うごため（record）：describeRecordToast（16-追記 v2.6.3）。それ以外：新たになかったことになったチートがあれば「{チート名}、なかったことに。」
  function applyChange(
    next: { wants?: MonthlyWantRow[]; meals?: MealLogRow[]; exercises?: ExerciseLogRow[] },
    record?: RecordToastInput,
    action?: { label: string; onClick: () => void }
  ) {
    const w = next.wants ?? wants
    const meals = next.meals ?? mealLogs
    const exercises = next.exercises ?? exerciseLogs
    const after = statusFor(w, meals, exercises)
    setWants(w)
    setMealLogs(meals)
    setExerciseLogs(exercises)
    scheduleFriendSync(userId)
    const durationMs = action ? UNDO_TOAST_MS : undefined
    if (record) {
      setToast({ message: describeRecordToast(record, status, after), durationMs, action })
      return
    }
    const cleared = detectNewlyCleared(status, after)
    if (cleared) setToast({ message: `${getCheatName(cleared)}、なかったことに。`, durationMs, action })
  }

  const viewLogs = mealLogs.filter((l) => l.log_date === viewDate)
  const viewWeight = weightLogs.find((w) => w.measured_at === viewDate) ?? null
  const todayAverage = calcWeightAverage(weightLogs, today)
  const { milestones, dismiss: dismissMilestone } = useMilestones(goal, todayAverage)

  // 表示中の日の、その食事のチート（品つき）と「追加チート」
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
    applyChange({ wants: nextWants, meals }, choice === 'light' ? { kind: 'meshitame' } : undefined)
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

  // いつものうごため：その場で保存して、トーストに［取り消す］を出す（16-追記 v2.6.2・v2.6.3）
  async function saveQuickExercise(values: QuickExercise) {
    const uid = await currentUserId()
    if (!uid) return
    const points = calcExercisePoints({ type: values.type, minutes: values.minutes })
    if (points <= 0) return
    setSavingExercise(true)
    const { data, error: insErr } = await supabase
      .from('exercise_logs')
      .insert({
        user_id: uid,
        log_date: viewDate,
        exercise_type: values.type,
        minutes: values.minutes,
        steps: null,
        points,
      })
      .select()
      .single()
    setSavingExercise(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    const row = data as ExerciseLogRow
    const exercises = [...exerciseLogs, row]
    applyChange({ exercises }, { kind: 'exercise', log: row }, { label: '取り消す', onClick: () => undoQuickExercise(row.id) })
  }

  async function undoQuickExercise(id: string) {
    const { error: delErr } = await supabase.from('exercise_logs').delete().eq('id', id)
    if (delErr) {
      setError(delErr.message)
      return
    }
    setExerciseLogs((logs) => logs.filter((l) => l.id !== id))
    scheduleFriendSync(userId)
  }

  function openExtra(date: string, editing: MonthlyWantRow | null = null) {
    setPicker({ target: { kind: 'extra', date }, editing, canRemove: !!editing })
  }

  // 今日がむくみやすい日か（17章）。予定のチートは今日の分まで数える
  const todayWaterHeavy = useMemo(
    () => listWaterHeavyDays({ wants, mealLogs, until: today }).includes(today),
    [wants, mealLogs, today]
  )

  // 体重を保存したら：戻り予報のトースト（17章）。当てはまらなければ上がった日のひと言（15.3）
  function handleWeightSaved(row: WeightLog) {
    const next = [...weightLogs.filter((w) => w.measured_at !== row.measured_at), row]
    setWeightLogs(next)
    scheduleFriendSync(userId)
    const water = describeWaterReturnToast({
      retention: calcWaterRetention({ wants, mealLogs, weightLogs: next, date: row.measured_at, today }),
      weightKg: Number(row.weight_kg),
      onTrack: status.onTrack,
      pendingKcal: status.pendingKcal,
      today,
    })
    if (water) {
      setToast({ message: water, durationMs: WATER_TOAST_MS })
      return
    }
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

        {lostInvite && (
          <div className="flex items-start justify-between gap-3 bg-stone-900 rounded-2xl px-4 py-3 mb-6">
            <p className="text-stone-300 text-sm">登録できました。誘いのリンクをもう一度開いてください。</p>
            <button type="button" onClick={() => setLostInvite(false)} className="text-stone-500 text-xs shrink-0">
              閉じる
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
          </section>
        )}

        {/* ◯月のチート（16章・16-追記 v2.6.2） */}
        <section className="mb-8">
          <MonthMeshitameCard
            month={month}
            status={status}
            monthWeightDiffKg={monthWeightDiffKg}
            onOpenLog={() => router.push('/log')}
            onRecordWalk={(minutes) => {
              setViewDate(today)
              setExerciseSheet({ initial: { type: 'walking', minutes } })
            }}
            onOpenHints={setHints}
          />
          {/* 戻り予報（17章）：今日がむくみやすい日のときだけ。カードの枠の外 */}
          {isToday && todayWaterHeavy && (
            <p className="text-stone-400 text-xs mt-2 px-1">{describeWaterTodayLine(today)}</p>
          )}
        </section>
        {/* 今日の記録：メシため（16章 3-1）とうごため（16-追記 v2.6.3・v2.6.4） */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-300">{isToday ? '今日の記録' : 'この日の記録'}</h2>
            <button
              type="button"
              onClick={() => setShowTargets(true)}
              className="bg-stone-800 text-stone-300 text-xs px-3 py-1 rounded-full"
            >
              目安
            </button>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-xs font-medium text-stone-500">
              {MEAL_CHOICE_EMOJI.light} {MEAL_CHOICE_LABELS.light}
            </h3>
            <p className="text-[11px] text-stone-600">{MESHITAME_SECTION_NOTE}</p>
          </div>
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

            {/* 追加チート */}
            <div className="bg-stone-900 rounded-2xl px-4 py-3 flex items-center gap-2">
              <p className="text-sm font-medium shrink-0 mr-1">追加チート</p>
              {extraRows.length === 0 ? (
                <p className="text-stone-500 text-xs flex-1 min-w-0 truncate">おやつ・お酒・2軒目など</p>
              ) : (
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
              )}
              <button
                type="button"
                onClick={() => openExtra(viewDate)}
                aria-label="追加チートを足す"
                className="shrink-0 w-8 h-8 rounded-full bg-stone-800 text-amber-400 text-lg leading-none"
              >
                ＋
              </button>
            </div>
          </div>

          <div className="mt-6">
            <QuickExerciseRow
              isToday={isToday}
              summary={describeDayExercises(exerciseLogs.filter((l) => l.log_date === viewDate))}
              exercises={quickExercises}
              saving={savingExercise}
              onQuick={saveQuickExercise}
              onMore={() => setExerciseSheet({})}
            />
          </div>
        </section>

        {/* フレンド（18章）：今日の記録の下に1枚 */}
        {userId && (
          <section className="mb-8">
            <FriendCard userId={userId} today={today} onOpen={() => router.push('/friends')} />
          </section>
        )}

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

      {exerciseSheet && userId && (
        <ExerciseSheet
          userId={userId}
          logDate={viewDate}
          initial={exerciseSheet.initial}
          onClose={() => setExerciseSheet(null)}
          onSaved={(row) => {
            setExerciseSheet(null)
            applyChange({ exercises: [...exerciseLogs, row] }, { kind: 'exercise', log: row })
          }}
        />
      )}

      {showTargets && <MealExamplesSheet targets={slotTargets} onClose={() => setShowTargets(false)} />}

      {hints && <CheatHintSheet hints={hints} onClose={() => setHints(null)} />}

      {toast && <Toast message={toast.message} durationMs={toast.durationMs} action={toast.action} onDone={clearToast} />}

      <BottomNav active="home" />
    </div>
  )
}
