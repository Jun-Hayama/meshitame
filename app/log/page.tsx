'use client'

// ログ（docs/v2-spec.md 14.3）：メシため・うごための記録を一覧で見て、直す。ボトムナビには出さない（今日のカードから入る）

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { ExerciseSheet } from '@/components/ExerciseSheet'
import { LogEditSheet } from '@/components/LogEditSheet'
import { Toast } from '@/components/Toast'
import { useReducePace } from '@/lib/reducePace'
import {
  EXERCISE_EMOJI,
  EXERCISE_LABEL,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  POINT_LABEL,
  type ExerciseLogRow,
  type GoalPlanRow,
  type LogFilter,
  type MealLogRow,
  type MealSlot,
  type MonthlyWantRow,
} from '@/types'
import {
  addDaysToDateStr,
  buildGaugeCheats,
  buildLogDays,
  calcBeerEquivalent,
  calcDailyIntakeFromPace,
  calcExerciseMinutes,
  calcMealSlotTargets,
  calcMonthEarnedBreakdown,
  detectNewlyZeroed,
  expandCheatsForMonth,
  formatDateJST,
  formatExerciseLog,
  formatMonthDayWeekday,
  getGaugeCheatName,
  getReplacedMealKeys,
  orderZeroCalCheats,
} from '@/lib/calories'
import { LOG_DAYS } from '@/lib/calorieConstants'

const SLOT_LABELS: Record<MealSlot, string> = { morning: '朝', lunch: '昼', dinner: '夜' }
const FILTERS: { value: LogFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'meal', label: MEAL_CHOICE_LABELS.light },
  { value: 'exercise', label: EXERCISE_LABEL },
]

export default function LogPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [goal, setGoal] = useState<GoalPlanRow | null>(null)
  const [wants, setWants] = useState<MonthlyWantRow[]>([])
  const [mealLogs, setMealLogs] = useState<MealLogRow[]>([])
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LogFilter>('all')
  const [editingMeal, setEditingMeal] = useState<MealLogRow | null>(null)
  const [editingExercise, setEditingExercise] = useState<ExerciseLogRow | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const today = formatDateJST(new Date())
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const monthStart = `${today.slice(0, 7)}-01`
  // 一覧（14日分）と今月の合計の両方に要る範囲
  const listFrom = addDaysToDateStr(today, -(LOG_DAYS - 1))
  const loadFrom = listFrom < monthStart ? listFrom : monthStart

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const [g, w, m, e] = await Promise.all([
        supabase.from('goal_plans').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
        supabase.from('monthly_wants').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('meal_logs').select('*').eq('user_id', user.id).gte('log_date', loadFrom).lte('log_date', today),
        supabase.from('exercise_logs').select('*').eq('user_id', user.id).gte('log_date', loadFrom).lte('log_date', today),
      ])
      const firstError = g.error ?? w.error ?? m.error ?? e.error
      if (firstError) setError(firstError.message)
      setGoal((g.data as GoalPlanRow) ?? null)
      setWants((w.data as MonthlyWantRow[]) || [])
      setMealLogs((m.data as MealLogRow[]) || [])
      setExerciseLogs((e.data as ExerciseLogRow[]) || [])
      setLoading(false)
    })
  }, [router, today, loadFrom])

  const { pace } = useReducePace(userId)
  const slotTargets = useMemo(
    () => (goal && pace ? calcMealSlotTargets(calcDailyIntakeFromPace(goal.tdee, goal.bmr, pace)) : []),
    [goal, pace]
  )
  const replacedMealKeys = useMemo(() => getReplacedMealKeys(wants), [wants])

  // 今月の貯まったptと、0kcal化の判定に使うチートの並び（記録を直すたびに計算し直す）
  const monthState = useCallback(
    (meals: MealLogRow[], exercises: ExerciseLogRow[]) => ({
      earned: calcMonthEarnedBreakdown({ year, month, today, mealLogs: meals, exerciseLogs: exercises, replacedMealKeys }),
      ordered: orderZeroCalCheats(
        buildGaugeCheats(expandCheatsForMonth(wants, year, month, slotTargets, today), meals, year, month, replacedMealKeys)
      ),
    }),
    [year, month, today, replacedMealKeys, wants, slotTargets]
  )
  const { earned } = monthState(mealLogs, exerciseLogs)
  const exerciseMinutes = calcExerciseMinutes(exerciseLogs, monthStart, today)
  const beer = calcBeerEquivalent(earned.totalPt)
  const days = buildLogDays({ today, mealLogs, exerciseLogs, filter, replacedMealKeys })

  // 直した結果、新たに0kcal化済みになったらトースト。「まだ」に戻ったときは何も出さない（14.3）
  function applyChange(meals: MealLogRow[], exercises: ExerciseLogRow[]) {
    const before = monthState(mealLogs, exerciseLogs).earned.totalPt
    const after = monthState(meals, exercises)
    const zeroed = detectNewlyZeroed(after.ordered, before, after.earned.totalPt)
    setMealLogs(meals)
    setExerciseLogs(exercises)
    if (zeroed) setToast(`${getGaugeCheatName(zeroed)}、なかったことに。`)
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-6">
          <button type="button" onClick={() => router.push('/')} className="text-stone-500 text-xs mb-1">
            ‹ 今日
          </button>
          <h1 className="text-xl font-bold">ログ</h1>
        </header>

        {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : (
          <main className="space-y-6">
            <section className="bg-stone-900 rounded-3xl p-5">
              <p className="text-sm">
                <span className="text-stone-400 text-xs">今月の{POINT_LABEL} </span>
                <span className="text-amber-400 text-2xl font-bold">{earned.totalPt.toLocaleString('ja-JP')}</span>
                <span className="text-stone-400">pt</span>
                {beer > 0 && <span className="text-stone-400 text-xs ml-2">≒ ビール{beer}杯ぶん</span>}
              </p>
              <p className="text-stone-400 text-xs mt-2">
                {MEAL_CHOICE_EMOJI.light} {MEAL_CHOICE_LABELS.light}
                {earned.tamemeshiCount}回 {earned.tamemeshiPt}pt
                <span className="text-stone-600"> ・ </span>
                {EXERCISE_EMOJI} {EXERCISE_LABEL}
                {exerciseMinutes}分 {earned.exercisePt}pt
              </p>
            </section>

            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1.5 rounded-full text-xs ${
                    filter === f.value ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <section>
              {days.length === 0 ? (
                <p className="text-stone-500 text-sm">この{LOG_DAYS}日間の記録はまだありません</p>
              ) : (
                <div className="space-y-4">
                  {days.map((day) => (
                    <div key={day.date}>
                      <p className="text-stone-500 text-xs mb-1.5 px-1">{formatMonthDayWeekday(day.date)}</p>
                      <ul className="bg-stone-900 rounded-2xl divide-y divide-stone-800">
                        {day.entries.map((entry) => (
                          <li key={entry.log.id}>
                            <button
                              type="button"
                              onClick={() =>
                                entry.kind === 'meal' ? setEditingMeal(entry.log) : setEditingExercise(entry.log)
                              }
                              className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm"
                            >
                              <span className="min-w-0 truncate">
                                {entry.kind === 'meal' ? (
                                  <>
                                    <span className="text-stone-500 mr-3">{SLOT_LABELS[entry.log.slot]}</span>
                                    {MEAL_CHOICE_LABELS.light}
                                  </>
                                ) : (
                                  <>
                                    {EXERCISE_LABEL}
                                    <span className="text-stone-400 ml-3">{formatExerciseLog(entry.log)}</span>
                                  </>
                                )}
                              </span>
                              <span className="text-amber-400 shrink-0 ml-2">+{entry.pt}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-stone-600 text-[11px] mt-4 px-1">
                過去{LOG_DAYS}日分の記録をタップで直せます。新しく記録できるのは7日前までです
              </p>
            </section>
          </main>
        )}
      </div>

      {editingMeal && (
        <LogEditSheet
          log={editingMeal}
          onClose={() => setEditingMeal(null)}
          onSaved={(row) => {
            setEditingMeal(null)
            applyChange([...mealLogs.filter((l) => l.id !== row.id), row], exerciseLogs)
          }}
          onDeleted={(id) => {
            setEditingMeal(null)
            applyChange(mealLogs.filter((l) => l.id !== id), exerciseLogs)
          }}
        />
      )}

      {editingExercise && userId && (
        <ExerciseSheet
          userId={userId}
          logDate={editingExercise.log_date}
          editing={editingExercise}
          onClose={() => setEditingExercise(null)}
          onSaved={(row) => {
            setEditingExercise(null)
            applyChange(mealLogs, [...exerciseLogs.filter((l) => l.id !== row.id), row])
          }}
          onDeleted={(id) => {
            setEditingExercise(null)
            applyChange(mealLogs, exerciseLogs.filter((l) => l.id !== id))
          }}
        />
      )}

      {toast && <Toast message={toast} onDone={clearToast} />}

      <BottomNav active="home" />
    </div>
  )
}
