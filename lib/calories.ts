import {
  LossLimitCheck,
  Gate,
  GatePlan,
  DailySavingResult,
  WantEntry,
  RecoveryOption,
  GoalPlanRow,
  CurrentMonthTargets,
  MonthlyWantRow,
  MealChoice,
  MealSlot,
  CheatType,
  CheatItemSelection,
  WantKind,
  ExerciseType,
  WeightLog,
  WeightAverage,
  WeekOverWeek,
  MonthTargets,
  MonthTargetBasis,
  MonthlyTargetRow,
  TargetLinePoint,
  WeightChartPoint,
  Milestone,
  MilestoneKind,
  ReducePace,
  HeartyCheatEntry,
  EarnedBreakdown,
  WeekSummary,
  CheatPlace,
  MonthCheat,
  Carryover,
  CheatLedgerEntry,
  PlannedCheat,
  MonthCheatStatus,
  LogDay,
  LogEntry,
  LogFilter,
  MealLogRow,
  ExerciseLogRow,
  CheatChartPeriod,
  CheatEvent,
  CheatChartBar,
  CheatWeightPoint,
  CheatWeightChartData,
  CheatEquivalent,
  CheatCardBar,
  EasiestWay,
  QuickExercise,
  ExercisePresets,
  RecordToastInput,
  CheatHints,
  WaterRetention,
  Footprint,
  FootprintLook,
  CheatCount,
  FriendProgressData,
} from '@/types'
import {
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  EXERCISE_TYPE_LABELS,
  EXERCISE_TYPE_EMOJI,
  EXERCISE_EMOJI,
  EXERCISE_LABEL,
} from '@/types'
import {
  KCAL_PER_KG,
  BMI_STANDARD,
  ANNUAL_LOSS_LIMITS,
  GATE_MONTHS,
  GATE_RATIOS_FOUR,
  GATE1_MIN_RATIO,
  MAX_DAILY_SAVING_KCAL,
  AVG_DAYS_PER_MONTH,
  REDUCE_PACE_KCAL,
  TAMEMESHI_PT,
  HEARTY_CHEAT_PT,
  WEEK_EARNED_EQUIVALENTS,
  WANT_COSTS,
  EXERCISE_POINTS,
  MEAL_RECORD_DELTA,
  EXERCISE_PT_PER_MIN,
  PT_PER_1000_STEPS,
  RECORD_PAST_DAYS,
  WEIGHT_INPUT_MIN_KG,
  WEIGHT_INPUT_MAX_KG,
  WEIGHT_AVG_DAYS,
  WEIGHT_AVG_MIN_COUNT,
  HEALTH_MILESTONES,
  WEIGHT_REASSURE_DIFF_KG,
  WEIGHT_RISING_WEEKS,
  WEIGHT_RISING_MIN_KG,
  LOG_DAYS,
  CHART_WEIGHT_HALF_RANGE_KG,
  CHART_WEIGHT_EXPAND_PAD_KG,
  CARRYOVER_LOOKBACK_MONTHS,
  FREQUENT_ITEM_DAYS,
  FREQUENT_ITEM_MAX,
  CHEAT_BAR_SHORT_MIN_RATIO,
  EASY_WALK_MAX_KCAL,
  EASY_WALK_STEP_MINUTES,
  CHEAT_EQUIVALENT_FALLBACK_FOOD,
  QUICK_EXERCISE_TYPES,
  EXERCISE_PRESET_DEFAULT_MINUTES,
  EXERCISE_PRESET_MIN_MINUTES,
  EXERCISE_PRESET_MAX_MINUTES,
  EXERCISE_PRESET_STEP_MINUTES,
  WATER_RETURN_DAYS,
  WATER_TOAST_MAX_DAY,
  WATER_UP_KG,
  WATER_BACK_KG,
  PROMISE_MAX_DAYS_AHEAD,
  PROMISE_PAST_VISIBLE_DAYS,
  FOOTPRINT_MAX,
  CHEAT_COUNT_MAX_KINDS,
  HIDDEN_CHEAT_EMOJI,
} from '@/lib/calorieConstants'
import { CHEAT_GENRE_MAP, CHEAT_ITEMS, type CheatGenre, type CheatItem } from '@/lib/cheatItems'
import {
  MEAL_EXAMPLES,
  MEAL_EXAMPLE_RANGE,
  MEAL_EXAMPLES_MAX,
  type MealExample,
  type MealExampleItem,
} from '@/lib/mealExamples'
import { FOOD_ITEM_MAP } from '@/lib/foodItems'

// 基礎代謝計算（ハリス・ベネディクト式）
export function calcBaseMetabolism(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: 'male' | 'female' | 'other'
): number {
  const male = 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
  const female = 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age
  if (sex === 'male') return Math.round(male)
  if (sex === 'female') return Math.round(female)
  return Math.round((male + female) / 2) // その他：男性式と女性式の平均
}

// 活動係数
const ACTIVITY_MULTIPLIER = {
  low: 1.2,
  moderate: 1.55,
  high: 1.725,
}

export function calcTDEE(
  bmr: number,
  activityLevel: 'low' | 'moderate' | 'high'
): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel])
}

// 日本時間での日付（YYYY-MM-DD）。DBの current_date はUTCなので、開始日などはこれで渡す
export function formatDateJST(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// ===== v2 計算ロジック（docs/v2-spec.md 6章）=====
// すべて決定的な純粋関数。月は 1〜12 で受け取る

const MS_PER_DAY = 24 * 60 * 60 * 1000
const EPSILON = 1e-9

function assertPeriodMonths(periodMonths: number) {
  if (!Number.isInteger(periodMonths) || periodMonths <= 0 || periodMonths % GATE_MONTHS !== 0) {
    throw new Error(`期間は${GATE_MONTHS}ヶ月単位で指定してください: ${periodMonths}`)
  }
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// --- 6-2. 目標設計とゲート ---

export function calcBMI(heightCm: number, weightKg: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

export function calcStandardWeight(heightCm: number): number {
  const m = heightCm / 100
  return BMI_STANDARD * m * m
}

export function getAnnualLossLimitRate(bmi: number): number {
  let rate = ANNUAL_LOSS_LIMITS[0].rate
  for (const limit of ANNUAL_LOSS_LIMITS) {
    if (bmi >= limit.minBmi) rate = limit.rate
  }
  return rate
}

export function checkLossLimit(input: {
  heightCm: number
  currentWeightKg: number
  targetWeightKg: number
  periodMonths: number
}): LossLimitCheck {
  const { heightCm, currentWeightKg, targetWeightKg, periodMonths } = input
  assertPeriodMonths(periodMonths)

  const bmi = calcBMI(heightCm, currentWeightKg)
  const annualLimitRate = getAnnualLossLimitRate(bmi)
  const annualLimitKg = currentWeightKg * annualLimitRate
  const limitKg = (annualLimitKg * periodMonths) / 12
  const targetLossKg = currentWeightKg - targetWeightKg
  const withinLimit = targetLossKg <= limitKg + EPSILON

  // 上限内に収まる最短の期間（3ヶ月単位）
  const suggestedPeriodMonths = withinLimit
    ? null
    : Math.ceil((targetLossKg * 12) / annualLimitKg / GATE_MONTHS - EPSILON) * GATE_MONTHS

  return {
    bmi,
    standardWeightKg: calcStandardWeight(heightCm),
    annualLimitRate,
    limitKg,
    targetLossKg,
    periodMonths,
    withinLimit,
    suggestedPeriodMonths,
  }
}

// 4ゲート（12ヶ月）は前半多めの配分、それ以外は均等配分
export function calcGates(
  currentWeightKg: number,
  targetLossKg: number,
  periodMonths: number = 12
): GatePlan {
  assertPeriodMonths(periodMonths)
  const count = periodMonths / GATE_MONTHS
  const ratios =
    count === GATE_RATIOS_FOUR.length
      ? GATE_RATIOS_FOUR
      : Array.from({ length: count }, () => 1 / count)

  let weight = currentWeightKg
  const gates: Gate[] = ratios.map((ratio, i) => {
    const lossKg = targetLossKg * ratio
    weight -= lossKg
    return {
      index: i + 1,
      ratio,
      lossKg,
      targetWeightKg: weight,
      endMonth: (i + 1) * GATE_MONTHS,
    }
  })

  const gate1MinKg = currentWeightKg * GATE1_MIN_RATIO
  return {
    gates,
    gate1MinKg,
    gate1MeetsMinimum: gates[0].lossKg >= gate1MinKg - EPSILON,
  }
}

export function calcMonthlyTarget(gateLossKg: number): number {
  return gateLossKg / GATE_MONTHS
}

// 1日の貯金 = 月の目標kg × 7200 ÷ その月の日数
// 上限 = min(750, TDEE − 基礎代謝)。ゲートの計画（初回設定・月の割り直し）用で、1日の目安には使わない（12-3）
export function calcDailySaving(
  monthlyTargetKg: number,
  year: number,
  month: number,
  tdee: number,
  bmr: number
): DailySavingResult {
  const uncappedKcal = Math.round((monthlyTargetKg * KCAL_PER_KG) / getDaysInMonth(year, month))
  const capKcal = Math.max(0, Math.min(MAX_DAILY_SAVING_KCAL, tdee - bmr))
  const savingKcal = Math.min(uncappedKcal, capKcal)
  return { savingKcal, uncappedKcal, capKcal, capped: uncappedKcal > capKcal }
}

// 1日の目安カロリー = TDEE − 1日の貯金（基礎代謝は下回らない）
export function calcDailyIntakeTarget(tdee: number, dailySavingKcal: number, bmr: number): number {
  return Math.max(tdee - dailySavingKcal, bmr)
}

// --- 12-3. 毎日の目安 = 必要量 − 減らすペース（基礎代謝を下回るときは基礎代謝） ---
// 画面の1日の目安はすべてこれで出す（ゲート・月の割り直しの1日の貯金は使わない）
export function calcDailyIntakeFromPace(tdee: number, bmr: number, pace: ReducePace): number {
  return calcDailyIntakeTarget(tdee, REDUCE_PACE_KCAL[pace], bmr)
}

// ペースの月あたりの目安kg（30日で換算。表示用：ゆっくり 0.5 / ふつう 1 / しっかり 2）
export function calcPaceKgPerMonth(pace: ReducePace): number {
  return Math.round(((REDUCE_PACE_KCAL[pace] * 30) / KCAL_PER_KG) * 10) / 10
}

// 1日の貯金をこのペースで続けたとき、目標kgまで何ヶ月かかるか（3ヶ月単位で切り上げ）
// 貯金が0以下なら届かないので null
export function estimateMonthsToTarget(targetLossKg: number, dailySavingKcal: number): number | null {
  if (targetLossKg <= 0) return 0
  if (dailySavingKcal <= 0) return null
  const kgPerMonth = (dailySavingKcal * AVG_DAYS_PER_MONTH) / KCAL_PER_KG
  return Math.ceil(targetLossKg / kgPerMonth / GATE_MONTHS - EPSILON) * GATE_MONTHS
}

// 今月の1日の貯金・目安（日付は日本時間で数える）
// 開始月を1ヶ月目として暦の月で数え、該当ゲートの目標 ÷ 3 を月の目標kgにする
// 開始前の日付は1ヶ月目として扱う。期間を過ぎたら finished: true で、貯金0（TDEEで維持）を返す
// 画面は割り直しを含む useMonthTargets（lib/monthTargets.ts）を使う。これは計画どおりの値
export function calcCurrentMonthTargets(
  plan: Pick<GoalPlanRow, 'start_date' | 'period_months' | 'gates' | 'tdee' | 'bmr'>,
  date: Date
): CurrentMonthTargets {
  const [year, month] = formatDateJST(date).split('-').map(Number)
  return calcPlanMonthTargets(plan, year, month)
}

// 開始月を1とした何ヶ月目か（開始前は1）
export function getMonthNumber(plan: Pick<GoalPlanRow, 'start_date'>, year: number, month: number): number {
  const [startYear, startMonth] = plan.start_date.split('-').map(Number)
  return Math.max(1, (year - startYear) * 12 + (month - startMonth) + 1)
}

export function calcPlanMonthTargets(
  plan: Pick<GoalPlanRow, 'start_date' | 'period_months' | 'gates' | 'tdee' | 'bmr'>,
  year: number,
  month: number
): CurrentMonthTargets {
  const monthNumber = getMonthNumber(plan, year, month)
  const finished = monthNumber > plan.period_months

  const gate = finished ? null : plan.gates[Math.ceil(monthNumber / GATE_MONTHS) - 1]
  const monthlyTargetKg = gate ? calcMonthlyTarget(gate.lossKg) : 0
  const dailySaving = calcDailySaving(monthlyTargetKg, year, month, plan.tdee, plan.bmr)

  return {
    year,
    month,
    monthNumber,
    gateIndex: gate ? gate.index : null,
    finished,
    monthlyTargetKg,
    dailySaving,
    dailyIntakeKcal: calcDailyIntakeTarget(plan.tdee, dailySaving.savingKcal, plan.bmr),
  }
}

// --- 11-3. 月の割り直し ---
// 月初に1回だけ決めて monthly_targets に保存する。月の途中では変えない

type PlanForTargets = Pick<GoalPlanRow, 'start_date' | 'period_months' | 'gates' | 'tdee' | 'bmr'>

// 月初の7日平均を取る日 = 前月の最後の日（その日を含む7日間 = 1日の7日前〜前日）
export function getMonthStartAverageDate(year: number, month: number): string {
  return addDaysToDateStr(`${year}-${String(month).padStart(2, '0')}-01`, -1)
}

// その月の目標をどう決めるか
// start / finished：計画どおりで保存しない。provisional：まだ来ていない月なので仮に計画どおり
// decide：保存済みの行を使う。なければ月初の7日平均で決めて保存する
export function getMonthTargetMode(
  plan: Pick<GoalPlanRow, 'start_date' | 'period_months'>,
  year: number,
  month: number,
  today: string
): 'start' | 'finished' | 'provisional' | 'decide' {
  const monthNumber = getMonthNumber(plan, year, month)
  if (monthNumber === 1) return 'start'
  if (monthNumber > plan.period_months) return 'finished'
  const [ty, tm] = today.split('-').map(Number)
  if (year * 12 + month > ty * 12 + tm) return 'provisional'
  return 'decide'
}

function withPlanBasis(base: CurrentMonthTargets, basis: MonthTargetBasis): MonthTargets {
  return {
    ...base,
    basis,
    startAvgKg: null,
    startAvgCount: 0,
    gateEndTargetKg: null,
    remainingMonths: null,
    ahead: false,
    shortfallKg: 0,
    cappedDismissed: false,
  }
}

// 割り直し（純粋関数）
// ゲートの終わりの目標体重 = 開始体重 − そのゲートまでのゲート目標の合計（= gates[i].targetWeightKg）
// 月の目標kg = （月初の7日平均 − ゲートの終わりの目標体重）÷ ゲートの残り月数（その月を含む）
// 月初の7日平均が参考値（3件未満）なら計画どおり。目標kgが0以下なら1日の貯金0（先行）
export function decideMonthTargets(
  plan: PlanForTargets,
  year: number,
  month: number,
  startAvg: WeightAverage
): MonthTargets {
  const base = calcPlanMonthTargets(plan, year, month)
  if (base.monthNumber === 1) return withPlanBasis(base, 'start')
  if (base.finished || base.gateIndex === null) return withPlanBasis(base, 'finished')

  const gate = plan.gates[base.gateIndex - 1]
  const remainingMonths = gate.endMonth - base.monthNumber + 1
  const startInfo = {
    startAvgKg: startAvg.avgKg,
    startAvgCount: startAvg.count,
    gateEndTargetKg: gate.targetWeightKg,
    remainingMonths,
  }
  if (startAvg.avgKg === null || startAvg.isReference) {
    return { ...withPlanBasis(base, 'plan'), ...startInfo }
  }

  const monthlyTargetKg = (startAvg.avgKg - gate.targetWeightKg) / remainingMonths
  const ahead = monthlyTargetKg <= 0
  const dailySaving = calcDailySaving(Math.max(0, monthlyTargetKg), year, month, plan.tdee, plan.bmr)
  // このままだと届かない見込み = 上限で削れなかった分 × 日数 ÷ 7200 × 残り月数
  const shortfallKg = dailySaving.capped
    ? ((dailySaving.uncappedKcal - dailySaving.capKcal) * getDaysInMonth(year, month) * remainingMonths) / KCAL_PER_KG
    : 0

  return {
    ...base,
    ...startInfo,
    basis: 'rebalanced',
    monthlyTargetKg,
    dailySaving,
    dailyIntakeKcal: calcDailyIntakeTarget(plan.tdee, dailySaving.savingKcal, plan.bmr),
    ahead,
    shortfallKg,
    cappedDismissed: false,
  }
}

// 保存する行（decideMonthTargets の basis が plan / rebalanced のときだけ）
export function monthTargetsToRow(
  t: MonthTargets,
  userId: string,
  goalPlanId: string
): Omit<MonthlyTargetRow, 'id' | 'created_at'> {
  if ((t.basis !== 'plan' && t.basis !== 'rebalanced') || t.gateIndex === null) {
    throw new Error(`保存しない月です: ${t.basis}`)
  }
  return {
    user_id: userId,
    goal_plan_id: goalPlanId,
    year: t.year,
    month: t.month,
    month_number: t.monthNumber,
    gate_index: t.gateIndex,
    basis: t.basis,
    start_avg_kg: t.startAvgKg === null ? null : Math.round(t.startAvgKg * 100) / 100,
    start_avg_count: t.startAvgCount,
    gate_end_target_kg: Math.round((t.gateEndTargetKg ?? 0) * 100) / 100,
    remaining_months: t.remainingMonths ?? 0,
    monthly_target_kg: Math.round(t.monthlyTargetKg * 1000) / 1000,
    daily_saving_kcal: t.dailySaving.savingKcal,
    uncapped_kcal: t.dailySaving.uncappedKcal,
    cap_kcal: t.dailySaving.capKcal,
    capped: t.dailySaving.capped,
    shortfall_kg: Math.round(t.shortfallKg * 100) / 100,
    capped_dismissed: false,
  }
}

// 保存済みの行 → 画面が使う形（目安カロリーは保存した1日の貯金から出す）
export function monthTargetsFromRow(plan: PlanForTargets, row: MonthlyTargetRow): MonthTargets {
  const savingKcal = Number(row.daily_saving_kcal)
  const monthlyTargetKg = Number(row.monthly_target_kg)
  return {
    year: row.year,
    month: row.month,
    monthNumber: row.month_number,
    gateIndex: row.gate_index,
    finished: false,
    monthlyTargetKg,
    dailySaving: {
      savingKcal,
      uncappedKcal: Number(row.uncapped_kcal),
      capKcal: Number(row.cap_kcal),
      capped: row.capped,
    },
    dailyIntakeKcal: calcDailyIntakeTarget(plan.tdee, savingKcal, plan.bmr),
    basis: row.basis,
    startAvgKg: row.start_avg_kg === null ? null : Number(row.start_avg_kg),
    startAvgCount: row.start_avg_count,
    gateEndTargetKg: Number(row.gate_end_target_kg),
    remainingMonths: row.remaining_months,
    ahead: row.basis === 'rebalanced' && monthlyTargetKg <= 0,
    shortfallKg: Number(row.shortfall_kg),
    cappedDismissed: row.capped_dismissed,
  }
}

// 保存しない月（開始月・期間後・まだ来ていない月）の値
export function planMonthTargets(
  plan: PlanForTargets,
  year: number,
  month: number,
  basis: 'start' | 'finished' | 'provisional'
): MonthTargets {
  return withPlanBasis(calcPlanMonthTargets(plan, year, month), basis)
}

// capped のとき「期間を延ばす」で /setup に入れる期間
// 今の7日平均から最終の目標体重まで、上限のペースで何ヶ月かかるか（3ヶ月単位）
export function calcExtendedPeriodMonths(currentAvgKg: number, targetWeightKg: number, capKcal: number): number | null {
  return estimateMonthsToTarget(currentAvgKg - targetWeightKg, capKcal)
}

// --- 6-4. マイナス時 ---

export function getWantCost(want: WantEntry): number {
  return want.costKcal ?? WANT_COSTS[want.kind]
}

// 日付指定の欲望を日付順、その後ろに頻度型（date: null）を登録順で並べる
function sortWants(wants: WantEntry[]): WantEntry[] {
  const dated = wants
    .filter((w) => w.date !== null)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))
  const undated = wants.filter((w) => w.date === null)
  return [...dated, ...undated]
}

// マイナス時の解消方法（ユーザーが選ぶ。欲望の予定は自動で動かさない）
export function calcRecoveryOptions(deficitKcal: number, wants: WantEntry[]): RecoveryOption[] {
  if (deficitKcal <= 0) return []

  const walkCount = Math.ceil(deficitKcal / EXERCISE_POINTS.walking_30min)
  const lightCount = Math.ceil(deficitKcal / TAMEMESHI_PT)

  return [
    {
      type: 'exercise',
      exercise: 'walking_30min',
      count: walkCount,
      points: walkCount * EXERCISE_POINTS.walking_30min,
    },
    { type: 'light_meals', count: lightCount, points: lightCount * TAMEMESHI_PT },
    ...sortWants(wants).map(
      (w): RecoveryOption => ({ type: 'swap_want', wantId: w.id, kind: w.kind, points: getWantCost(w) })
    ),
  ]
}

// 朝・昼・夜の目安kcal（毎日共通）。合計は1日の目安（12-3で −150 は廃止）
export interface MealSlotTarget {
  slot: MealSlot
  label: string
  kcal: number
}

const SLOT_RATIOS: [number, number, number] = [0.25, 0.35, 0.4]

const SLOT_ORDER: MealSlot[] = ['morning', 'lunch', 'dinner']

const SLOT_LABELS: Record<MealSlot, string> = {
  morning: '朝',
  lunch: '昼',
  dinner: '夜',
}

export function calcMealSlotTargets(dailyIntakeKcal: number): MealSlotTarget[] {
  const totalKcal = Math.max(0, dailyIntakeKcal)
  const slots = SLOT_ORDER
  let allocated = 0
  return slots.map((slot, i) => {
    const kcal =
      i === slots.length - 1 ? totalKcal - allocated : Math.round(totalKcal * SLOT_RATIOS[i])
    allocated += kcal
    return { slot, label: SLOT_LABELS[slot], kcal }
  })
}

// --- 10-2・13.2. 目安くらいの例・がっつりの例 ---

// 例の合計kcal = 辞書のkcal × 数量の合計
export function calcMealExampleKcal(items: MealExampleItem[]): number {
  return items.reduce((sum, i) => sum + FOOD_ITEM_MAP[i.id].kcal * i.qty, 0)
}

// 例の内訳（「おにぎり（鮭）1個 180kcal」の行）
export function buildMealExampleBreakdown(
  items: MealExampleItem[]
): { id: string; label: string; kcal: number }[] {
  return items.map((i) => {
    const food = FOOD_ITEM_MAP[i.id]
    return { id: i.id, label: `${food.name}${i.qty}${food.unit}`, kcal: food.kcal * i.qty }
  })
}

// kcal を step 単位で切り上げ（1049 → 1050、1050 → 1050）
export function roundUpKcal(kcal: number, step = 50): number {
  return Math.ceil(kcal / step) * step
}

export type PickedMealExample = MealExample & { kcal: number }

export interface MealExamples {
  normal: PickedMealExample[] // 目安 ±15%
  hearty: PickedMealExample[] // 目安 + 300 を50kcal単位で切り上げた値以上
  heartyMinKcal: number // 表示するしきい値（50kcal単位）
}

// 近い順に並べ、同じジャンルは先に2件までにして和・洋・中・外食・コンビニを混ぜる。表示は近い順
function pickMixed(
  candidates: PickedMealExample[],
  distance: (m: PickedMealExample) => number
): PickedMealExample[] {
  const sorted = [...candidates].sort((a, b) => distance(a) - distance(b))
  const picked: PickedMealExample[] = []
  const perGenre = new Map<string, number>()
  for (const m of sorted) {
    if (picked.length >= MEAL_EXAMPLES_MAX) break
    const n = perGenre.get(m.genre) ?? 0
    if (n >= 2) continue
    perGenre.set(m.genre, n + 1)
    picked.push(m)
  }
  for (const m of sorted) {
    if (picked.length >= MEAL_EXAMPLES_MAX) break
    if (!picked.includes(m)) picked.push(m)
  }
  return picked.sort((a, b) => distance(a) - distance(b))
}

export function pickMealExamples(
  slot: MealSlot,
  targetKcal: number,
  menu: MealExample[] = MEAL_EXAMPLES
): MealExamples {
  const forSlot = menu
    .filter((m) => m.slots.includes(slot))
    .map((m) => ({ ...m, kcal: calcMealExampleKcal(m.items) }))
  const range = targetKcal * MEAL_EXAMPLE_RANGE
  // 表示と同じ値で絞る（「1050kcal〜」に1049kcalの例が入らないように）
  const heartyMin = roundUpKcal(targetKcal + MEAL_RECORD_DELTA.hearty)

  return {
    normal: pickMixed(
      forSlot.filter((m) => Math.abs(m.kcal - targetKcal) <= range),
      (m) => Math.abs(m.kcal - targetKcal)
    ),
    hearty: pickMixed(
      forSlot.filter((m) => m.kcal >= heartyMin),
      (m) => m.kcal - heartyMin
    ),
    heartyMinKcal: heartyMin,
  }
}

// --- 10-3. チートを細かく登録する ---

export function sumCheatItemsKcal(items: Pick<CheatItemSelection, 'kcal' | 'qty'>[]): number {
  return items.reduce((sum, i) => sum + i.kcal * i.qty, 0)
}

// 食事のチート（replace）：合計 − その食事の目安（下回るときは0）/ 追加チート（addon）：合計そのまま
export function calcCheatCost(cheatType: CheatType, totalKcal: number, slotTargetKcal: number): number {
  return cheatType === 'replace' ? Math.max(0, totalKcal - slotTargetKcal) : totalKcal
}

function genreDef(genre: string) {
  return CHEAT_GENRE_MAP[genre as CheatGenre] ?? null
}

// 既存の kind 列に入れる値（最初のアイテムのジャンルから）
export function getCheatKind(items: Pick<CheatItemSelection, 'genre'>[]): WantKind {
  return (items.length > 0 && genreDef(items[0].genre)?.kind) || 'other'
}

// 一覧に出す名前（例：家系＋ライス、ビール500ml×2＋唐揚げ）
export function buildCheatLabel(items: Pick<CheatItemSelection, 'name' | 'qty'>[]): string {
  return items.map((i) => (i.qty > 1 ? `${i.name}×${i.qty}` : i.name)).join('＋')
}

// 登録済みチート1回分のコスト。中身を選んでいない行は WANT_COSTS をデフォルトに使う
// 食事のチートの食事が未指定なら夜として扱う
export function getMonthlyWantRowCost(
  row: Pick<MonthlyWantRow, 'kind' | 'cheat_type' | 'replace_slot' | 'total_kcal'>,
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
): number {
  if (row.cheat_type == null || row.total_kcal == null) return WANT_COSTS[row.kind]
  const slot = row.replace_slot ?? 'dinner'
  const target = slotTargets.find((t) => t.slot === slot)?.kcal ?? 0
  return calcCheatCost(row.cheat_type, row.total_kcal, target)
}

// よく使うアイテムを上に（使った回数順。同じ回数なら元の並び）
export function sortCheatItemsByUsage(
  items: CheatItem[],
  history: { items: Pick<CheatItemSelection, 'genre' | 'name' | 'qty'>[] | null }[]
): CheatItem[] {
  const counts = new Map<string, number>()
  for (const row of history) {
    for (const i of row.items ?? []) {
      const key = `${i.genre}:${i.name}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return items
    .map((item, index) => ({ item, index, count: counts.get(`${item.genre}:${item.name}`) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((x) => x.item)
}

// --- 16. v2.6 ◯月のチート：どこから足したかで数え方を決める ---

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// その月の初日・末日
export function getMonthDateRange(year: number, month: number): { from: string; to: string } {
  const prefix = monthPrefix(year, month)
  return { from: `${prefix}-01`, to: `${prefix}-${String(getDaysInMonth(year, month)).padStart(2, '0')}` }
}

// 足した場所：食事のチート（cheat_type = replace）は朝・昼・夜（未指定は夜）。それ以外は追加チート
export function getCheatPlace(row: Pick<MonthlyWantRow, 'cheat_type' | 'replace_slot'>): CheatPlace {
  return row.cheat_type === 'replace' ? (row.replace_slot ?? 'dinner') : 'extra'
}

// 同じ日の並び：朝・昼・夜・追加チート
const PLACE_ORDER: CheatPlace[] = ['morning', 'lunch', 'dinner', 'extra']

// 日付のあるチート（頻度ベース以外）
function isDatedCheat(r: Pick<MonthlyWantRow, 'is_active' | 'scheduled_date'>): boolean {
  return r.is_active !== false && r.scheduled_date != null
}

// 食事のチートが入っている「日付:食事」（その食事の🔥チート300・メシためは数えない）
// 日付のない頻度ベースは対象外
export function getReplacedMealKeys(
  rows: Pick<MonthlyWantRow, 'scheduled_date' | 'cheat_type' | 'replace_slot' | 'is_active'>[]
): Set<string> {
  const keys = new Set<string>()
  for (const r of rows) {
    if (!isDatedCheat(r) || r.cheat_type !== 'replace') continue
    keys.add(`${r.scheduled_date}:${r.replace_slot ?? 'dinner'}`)
  }
  return keys
}

// 品を選ばなかった🔥チート（meal_logs の hearty）。日付・食事の順
// 品つきの食事のチートがある食事は数えない（品の分と二重にしない）
export function expandHeartyCheats(
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[],
  from: string,
  to: string,
  replacedMealKeys?: Set<string>
): HeartyCheatEntry[] {
  return mealLogs
    .filter(
      (l) =>
        l.choice === 'hearty' &&
        l.log_date >= from &&
        l.log_date <= to &&
        !replacedMealKeys?.has(`${l.log_date}:${l.slot}`)
    )
    .sort((a, b) => a.log_date.localeCompare(b.log_date) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    .map((l) => ({ mode: 'hearty', date: l.log_date, slot: l.slot, costPt: HEARTY_CHEAT_PT }))
}

function cheatFromRow(row: MonthlyWantRow, slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]): MonthCheat {
  return {
    kind: 'cheat',
    key: row.id,
    date: row.scheduled_date as string,
    place: getCheatPlace(row),
    costKcal: getMonthlyWantRowCost(row, slotTargets),
    row,
  }
}

function cheatFromHearty(e: HeartyCheatEntry): MonthCheat {
  return { kind: 'hearty', key: `hearty:${e.date}:${e.slot}`, date: e.date, place: e.slot, costKcal: e.costPt, row: null }
}

// なかったことにする順番：日付の早い順、同じ日は朝・昼・夜・追加チート、さらに登録順
function compareCheats(a: MonthCheat, b: MonthCheat): number {
  return (
    a.date.localeCompare(b.date) ||
    PLACE_ORDER.indexOf(a.place) - PLACE_ORDER.indexOf(b.place) ||
    (a.row?.created_at ?? '').localeCompare(b.row?.created_at ?? '')
  )
}

// from〜to のチート：日付のあるチート ＋ 品を選ばなかった🔥チート × 300。頻度ベースは数えない
export function listCheatsInRange(input: {
  wants: MonthlyWantRow[]
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
  from: string
  to: string
}): MonthCheat[] {
  const { wants, mealLogs, slotTargets, from, to } = input
  const dated = wants
    .filter((r) => isDatedCheat(r) && (r.scheduled_date as string) >= from && (r.scheduled_date as string) <= to)
    .map((r) => cheatFromRow(r, slotTargets))
  const hearty = expandHeartyCheats(mealLogs, from, to, getReplacedMealKeys(wants)).map(cheatFromHearty)
  return [...dated, ...hearty].sort(compareCheats)
}

// 貯めた分 = メシため × 150 ＋ うごための kcal。いつもの・記録なし・🔥チートは0
// 食事のチートがある食事の記録は数えない
export function calcEarnedBreakdown(input: {
  from: string
  to: string
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  exerciseLogs: { log_date: string; points: number }[]
  replacedMealKeys?: Set<string>
}): EarnedBreakdown {
  const { from, to, mealLogs, exerciseLogs, replacedMealKeys } = input
  const inRange = (d: string) => d >= from && d <= to
  const tamemeshiCount = mealLogs.filter(
    (l) => l.choice === 'light' && inRange(l.log_date) && !replacedMealKeys?.has(`${l.log_date}:${l.slot}`)
  ).length
  const tamemeshiPt = tamemeshiCount * TAMEMESHI_PT
  const exercises = exerciseLogs.filter((l) => inRange(l.log_date))
  const exercisePt = exercises.reduce((sum, l) => sum + l.points, 0)
  return { tamemeshiCount, tamemeshiPt, exerciseCount: exercises.length, exercisePt, totalPt: tamemeshiPt + exercisePt }
}

// その月の今日までの貯めた分（どの日の分も同じ月に入る）
export function calcMonthEarnedBreakdown(input: {
  year: number
  month: number
  today: string // YYYY-MM-DD（日本時間）
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  exerciseLogs: { log_date: string; points: number }[]
  replacedMealKeys?: Set<string>
}): EarnedBreakdown {
  const { from, to } = getMonthDateRange(input.year, input.month)
  return calcEarnedBreakdown({ ...input, from, to: to < input.today ? to : input.today })
}

export function calcMonthEarnedPt(input: Parameters<typeof calcMonthEarnedBreakdown>[0]): number {
  return calcMonthEarnedBreakdown(input).totalPt
}

type MonthCheatInput = {
  year: number
  month: number
  today: string // YYYY-MM-DD（日本時間）
  wants: MonthlyWantRow[]
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[] // getCheatLoadFrom の日から読む（持ち越しのため）
  exerciseLogs: { log_date: string; points: number }[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
}

// n か月ずらした年・月
function shiftMonth(year: number, month: number, n: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + n
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

// ◯月のチートの計算に要る記録の読み込み開始日（持ち越しのため、さかのぼる月の初日）
export function getCheatLoadFrom(year: number, month: number): string {
  const start = shiftMonth(year, month, -CARRYOVER_LOOKBACK_MONTHS)
  return getMonthDateRange(start.year, start.month).from
}

// 持ち越し（v2.6.1）：前月のチート（前月の持ち越しは含めない）のうち、前月末にまだの分。期限はなく、今月の月末まで当てる
// 持ち越す量 = max(0, その月のチート − max(0, その月の貯めた分 − 前月からの持ち越し))
// 前月の持ち越しはさらに前の月で決まるので、CARRYOVER_LOOKBACK_MONTHS か月前から順に計算する（いちばん古い月は0）
export function calcCarryover(input: MonthCheatInput): Carryover {
  const { year, month, wants, mealLogs, exerciseLogs, slotTargets } = input
  const replacedMealKeys = getReplacedMealKeys(wants)
  let carry = 0
  for (let n = CARRYOVER_LOOKBACK_MONTHS; n >= 1; n--) {
    const m = shiftMonth(year, month, -n)
    const range = getMonthDateRange(m.year, m.month)
    const cheats = listCheatsInRange({ wants, mealLogs, slotTargets, ...range }).reduce((s, c) => s + c.costKcal, 0)
    const saved = calcEarnedBreakdown({ ...range, mealLogs, exerciseLogs, replacedMealKeys }).totalPt
    carry = Math.max(0, cheats - Math.max(0, saved - carry))
  }
  return { kcal: carry }
}

// ◯月のチート（16章）。持ち越し → 日付順に貯めた分を当て、全額に届いたものを「なかったことに」
export function calcMonthCheatStatus(input: MonthCheatInput): MonthCheatStatus {
  const { year, month, today, wants, mealLogs, exerciseLogs, slotTargets } = input
  const { from, to } = getMonthDateRange(year, month)
  const until = to < today ? to : today
  const carry = calcCarryover(input)
  const replacedMealKeys = getReplacedMealKeys(wants)

  const cheats = listCheatsInRange({ wants, mealLogs, slotTargets, from, to: until })
  const carryEntry: MonthCheat = { kind: 'carryover', key: 'carryover', date: from, place: 'morning', costKcal: carry.kcal, row: null }
  const ordered = carry.kcal > 0 ? [carryEntry, ...cheats] : cheats

  const earned = calcEarnedBreakdown({ from, to: until, mealLogs, exerciseLogs, replacedMealKeys })
  const savedKcal = earned.totalPt
  let cumulative = 0
  const entries: CheatLedgerEntry[] = ordered.map((cheat) => {
    cumulative += cheat.costKcal
    return { cheat, cumulativeKcal: cumulative, cleared: cumulative <= savedKcal }
  })
  const eatenKcal = cumulative
  const pendingKcal = Math.max(0, eatenKcal - savedKcal)
  const spareKcal = Math.max(0, savedKcal - eatenKcal)

  // 予定：今月の、今日より後のチートに余りを当てていく（翌月の予定は対象にしない）
  let planCumulative = 0
  const planned: PlannedCheat[] =
    until >= to
      ? []
      : listCheatsInRange({ wants, mealLogs: [], slotTargets, from: addDaysToDateStr(until, 1), to }).map((cheat) => {
          planCumulative += cheat.costKcal
          const shortKcal = Math.max(0, pendingKcal + planCumulative - spareKcal)
          return { cheat, ready: shortKcal === 0, shortKcal, tamemeshiNeeded: Math.ceil(shortKcal / TAMEMESHI_PT) }
        })

  return {
    entries,
    earned,
    carryoverKcal: carry.kcal,
    eatenKcal,
    savedKcal,
    clearedKcal: Math.min(savedKcal, eatenKcal),
    pendingKcal,
    spareKcal,
    tamemeshiNeeded: Math.ceil(pendingKcal / TAMEMESHI_PT),
    stage: pendingKcal > 0 ? 'pending' : spareKcal > 0 ? 'spare' : 'empty',
    onTrack: eatenKcal >= 1 && pendingKcal === 0,
    planned,
  }
}

// 記録の前後を比べて、新たになかったことになったチート（複数なら最後の1件）。無ければ null
export function detectNewlyCleared(before: MonthCheatStatus, after: MonthCheatStatus): MonthCheat | null {
  const cleared = new Set(before.entries.filter((e) => e.cleared).map((e) => e.cheat.key))
  const added = after.entries.filter((e) => e.cleared && !cleared.has(e.cheat.key))
  return added.length > 0 ? added[added.length - 1].cheat : null
}

// --- 16. 名前・絵文字・文言 ---

const formatKcal = (kcal: number) => kcal.toLocaleString('ja-JP')
const dayOf = (date: string) => Number(date.slice(8, 10))

// 「9日の夜のチート」（品を選ばなかった🔥チート）
export function heartyCheatLabel(date: string, slot: MealSlot): string {
  return `${dayOf(date)}日の${SLOT_LABELS[slot]}のチート`
}

// トースト・ログに出すチートの名前
export function getCheatName(cheat: MonthCheat): string {
  if (cheat.kind === 'carryover') return '先月の分'
  if (cheat.kind === 'hearty') return heartyCheatLabel(cheat.date, cheat.place as MealSlot)
  const row = cheat.row as MonthlyWantRow
  return row.label || WANT_KIND_LABELS[row.kind]
}

// チートの行の絵文字：アイテム表のジャンルの絵文字（中身なしは kind の絵文字）
export function getCheatRowEmoji(row: Pick<MonthlyWantRow, 'items' | 'kind'>): string {
  const genre = row.items?.[0]?.genre
  return (genre && genreDef(genre)?.emoji) || WANT_KIND_EMOJI[row.kind]
}

// 品の絵文字（「🔥チート 🍜🍺」）。同じ絵文字は1つにまとめる
export function getCheatItemEmojis(rows: Pick<MonthlyWantRow, 'items' | 'kind'>[]): string {
  const emojis: string[] = []
  for (const row of rows) {
    const list = row.items?.length ? row.items.map((i) => genreDef(i.genre)?.emoji ?? WANT_KIND_EMOJI[row.kind]) : [getCheatRowEmoji(row)]
    for (const e of list) if (!emojis.includes(e)) emojis.push(e)
  }
  return emojis.join('')
}

export function getCheatEmoji(cheat: MonthCheat): string {
  if (cheat.kind === 'hearty') return MEAL_CHOICE_EMOJI.hearty
  if (cheat.kind === 'carryover') return ''
  return getCheatRowEmoji(cheat.row as MonthlyWantRow)
}

// 今月食べたチートが1つ以上あるか（持ち越しは含めない）
export function hasMonthCheats(status: MonthCheatStatus): boolean {
  return status.entries.some((e) => e.cheat.kind !== 'carryover')
}

// --- 16-追記 v2.6.2 ◯月のチートのカード ---

// 1本の棒：全体 = チートと貯めた分の大きいほう。両方0なら棒なし（null）
// 足りない部分はどんなに小さくても CHEAT_BAR_SHORT_MIN_RATIO 以上。超えた部分はチートの位置に縦線
export function calcCheatCardBar(cheatKcal: number, savedKcal: number): CheatCardBar | null {
  if (cheatKcal <= 0 && savedKcal <= 0) return null
  if (savedKcal < cheatKcal) {
    const short = Math.max(CHEAT_BAR_SHORT_MIN_RATIO, (cheatKcal - savedKcal) / cheatKcal)
    return { kind: 'short', filled: 1 - short, short, over: 0, markerAt: null }
  }
  if (savedKcal === cheatKcal) return { kind: 'exact', filled: 1, short: 0, over: 0, markerAt: 1 }
  const filled = cheatKcal / savedKcal
  return { kind: 'over', filled, short: 0, over: 1 - filled, markerAt: cheatKcal > 0 ? filled : null }
}

// 辞書の名前から（…）を外す：「ビール（350ml）」→「ビール」
function shortFoodName(name: string): string {
  return name.replace(/（[^）]*）/g, '').trim() || name
}

// 品（genre:name）→ 辞書の品。自由入力の品は辞書にないので換算に使わない
const CHEAT_ITEM_FOOD = new Map(
  CHEAT_ITEMS.filter((i) => i.foodId).map((i) => [`${i.genre}:${i.name}`, { foodId: i.foodId!, genre: i.genre }])
)

// 見出しの下の換算：その月のチートの合計を、その月にいちばん多く（kcal×数量で）食べた品に換算する
// 品がない（品なしの🔥チートだけ・自由入力だけ）ときはラーメン。チートが0なら null
export function pickCheatEquivalent(status: Pick<MonthCheatStatus, 'entries' | 'eatenKcal'>): CheatEquivalent | null {
  if (status.eatenKcal <= 0) return null
  const totals = new Map<string, number>()
  for (const e of status.entries) {
    if (e.cheat.kind !== 'cheat') continue
    for (const item of e.cheat.row?.items ?? []) {
      const key = `${item.genre}:${item.name}`
      if (!CHEAT_ITEM_FOOD.has(key)) continue
      totals.set(key, (totals.get(key) ?? 0) + item.kcal * item.qty)
    }
  }
  let topKey: string | null = null
  for (const [key, kcal] of totals) if (topKey === null || kcal > (totals.get(topKey) as number)) topKey = key
  const top = topKey ? CHEAT_ITEM_FOOD.get(topKey)! : null
  const food = FOOD_ITEM_MAP[top?.foodId ?? CHEAT_EQUIVALENT_FALLBACK_FOOD]
  return {
    name: shortFoodName(food.name),
    unit: food.unit,
    count: Math.max(1, Math.round(status.eatenKcal / food.kcal)),
    drink: top?.genre === 'alcohol',
  }
}

// 「ビール約40缶ぶん飲んで、月初めから0.4kg減」／「…、体重はそのまま」／増えた・計算できないときは「…ぶん食べました」
export function describeCheatHeadline(eq: CheatEquivalent | null, monthWeightDiffKg: number | null): string | null {
  if (!eq) return null
  const amount = `${eq.name}約${eq.count}${eq.unit}ぶん`
  const tenths = monthWeightDiffKg === null ? null : Math.round(monthWeightDiffKg * 10)
  const te = eq.drink ? '飲んで' : '食べて'
  if (tenths !== null && tenths < 0) return `${amount}${te}、月初めから${formatWeightChange(monthWeightDiffKg as number)}`
  if (tenths === 0) return `${amount}${te}、体重はそのまま`
  return `${amount}${eq.drink ? '飲みました' : '食べました'}`
}

// 棒の下の「あと135kcal」
export function describeShortLabel(pendingKcal: number): string {
  return `あと${formatKcal(pendingKcal)}kcal`
}

// いちばん手軽に届く方法：まだの分が300kcal以下なら、ウォーキングで届く分数（10分単位で切り上げ）
export function pickEasiestWay(pendingKcal: number): EasiestWay | null {
  if (pendingKcal <= 0 || pendingKcal > EASY_WALK_MAX_KCAL) return null
  const minutes = Math.ceil(pendingKcal / EXERCISE_PT_PER_MIN.walking / EASY_WALK_STEP_MINUTES) * EASY_WALK_STEP_MINUTES
  return { type: 'walking', minutes }
}

// ヒントのシートの見出しの下の1行（18-追記 v2.8.1）：「🚶 30分歩けば、なかったことに」
export function describeEasiestWay(way: EasiestWay): string {
  return `${EXERCISE_TYPE_EMOJI.walking} ${way.minutes}分歩けば、なかったことに`
}

// ヒントのシートの［記録する］つきの1行：まだの分が300kcal以下のときだけ。より多い・0以下なら null
export function describeEasyWalkLine(pendingKcal: number): { text: string; walkMinutes: number } | null {
  const way = pickEasiestWay(pendingKcal)
  return way ? { text: describeEasiestWay(way), walkMinutes: way.minutes } : null
}

// ヒントの数：まだの分を それぞれの kcal で割って切り上げ。まだの分が0なら null
export function buildCheatHints(pendingKcal: number): CheatHints | null {
  if (pendingKcal <= 0) return null
  const rawSteps = Math.ceil((pendingKcal * 1000) / PT_PER_1000_STEPS)
  const stepUnit = rawSteps >= 10000 ? 1000 : 100
  return {
    pendingKcal,
    tamemeshiCount: Math.ceil(pendingKcal / TAMEMESHI_PT),
    walkingMinutes: Math.ceil(pendingKcal / EXERCISE_PT_PER_MIN.walking),
    walking30Count: Math.ceil(pendingKcal / (EXERCISE_PT_PER_MIN.walking * 30)),
    runningMinutes: Math.ceil(pendingKcal / EXERCISE_PT_PER_MIN.running),
    steps: Math.ceil(rawSteps / stepUnit) * stepUnit,
  }
}

// 60分以上は「4時間」「1時間30分」、それ未満は「45分」
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}時間${m}分` : `${h}時間`
}

// 1万歩以上は「3万5千歩」「2万歩」、それ未満は「8,600歩」
export function formatSteps(steps: number): string {
  if (steps < 10000) return `${steps.toLocaleString('ja-JP')}歩`
  const man = Math.floor(steps / 10000)
  const sen = Math.floor((steps % 10000) / 1000)
  return `${man}万${sen > 0 ? `${sen}千` : ''}歩`
}

// 今日の記録の「うごき」の「🚶30分・👣8,000歩」（記録した順）。記録がなければ null
export function describeDayExercises(
  logs: Pick<ExerciseLogRow, 'exercise_type' | 'minutes' | 'steps' | 'created_at'>[]
): string | null {
  if (logs.length === 0) return null
  return [...logs]
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((l) =>
      l.exercise_type === 'steps'
        ? `${EXERCISE_TYPE_EMOJI.steps}${(l.steps ?? 0).toLocaleString('ja-JP')}歩`
        : `${EXERCISE_TYPE_EMOJI[l.exercise_type]}${l.minutes ?? 0}分`
    )
    .join('・')
}

export const CHEAT_CARD_INTRO = '飲みたい日は飲む。そのぶんは、メシためでなかったことに。'
// カードでは使わない（16-追記 v2.6.2）。トースト（体重のトーストなど）でだけ使う
export const CHEAT_CARD_ON_TRACK = '好きなものを食べながら、ちゃんと痩せてます'

// カードのチートの kcal の横の ✓（16-追記 v2.6.5）：チートが1以上で、貯めた分がチート以上（まだの分0）のときだけ
export function isCheatCovered(status: Pick<MonthCheatStatus, 'eatenKcal' | 'pendingKcal'>): boolean {
  return status.eatenKcal > 0 && status.pendingKcal === 0
}

// 「28日の焼肉は、もう準備OK」／「28日の焼肉まで、あと450kcal」
export function describePlannedLine(plan: PlannedCheat): string {
  const name = `${dayOf(plan.cheat.date)}日の${getCheatName(plan.cheat)}`
  return plan.ready ? `${name}は、もう準備OK` : `${name}まで、あと${formatKcal(plan.shortKcal)}kcal`
}

// 貯めた kcal を身近な品で言い換える（「ビール1本」）。いちばん小さい品に届かないときは null
export function pickSavedEquivalent(kcal: number): (typeof WEEK_EARNED_EQUIVALENTS)[number] | null {
  return [...WEEK_EARNED_EQUIVALENTS].reverse().find((e) => e.pt <= kcal) ?? null
}

// 「🐷 メシため。ビール1本ぶんです」
export function describeMeshitameToast(): string {
  const eq = pickSavedEquivalent(TAMEMESHI_PT)
  return `${MEAL_CHOICE_EMOJI.light} ${MEAL_CHOICE_LABELS.light}。${eq ? `${eq.label}ぶんです` : ''}`
}

// 「🏃 うごため 30分。ビール1本ぶんです」（届かないときは「🏃 うごため 10分。」）
export function describeExerciseToast(log: Pick<ExerciseLogRow, 'exercise_type' | 'minutes' | 'steps' | 'points'>): string {
  const eq = pickSavedEquivalent(log.points)
  return `${EXERCISE_EMOJI} ${EXERCISE_LABEL} ${describeExerciseAmount(log)}。${eq ? `${eq.label}ぶんです` : ''}`
}

// トーストの「30分」「8,000歩」
function describeExerciseAmount(log: Pick<ExerciseLogRow, 'exercise_type' | 'minutes' | 'steps'>): string {
  return log.exercise_type === 'steps' ? `${(log.steps ?? 0).toLocaleString('ja-JP')}歩` : `${log.minutes ?? 0}分`
}

// --- 16-追記 v2.6.3 記録のトースト ---

// メシため・うごためを保存したあとのトースト（1つだけ）。before / after はその記録の前後の状態
// 1. なかったことになった → 「{チート名}、なかったことに。」
// 2. まだの分が残る → 「🐷 メシため。あと15kcalです」
// 3. 今月のチートも予定もない → 「🐷 メシため。ビール1本ぶんです」
// 4. 今月のチートはなく、今日より後に予定がある → 「🐷 メシため。28日の焼肉まで、あと300kcalです」／「…は、もう準備OKです」
// 5. それ以外（今月のチートはぜんぶなかったことになっている）→ 「🐷 メシため。今月のチートは、ぜんぶなかったことに。」（16-追記 v2.6.4）
export function describeRecordToast(record: RecordToastInput, before: MonthCheatStatus, after: MonthCheatStatus): string {
  const cleared = detectNewlyCleared(before, after)
  if (cleared) return `${getCheatName(cleared)}、なかったことに。`
  const head =
    record.kind === 'meshitame'
      ? `${MEAL_CHOICE_EMOJI.light} ${MEAL_CHOICE_LABELS.light}`
      : `${EXERCISE_EMOJI} ${EXERCISE_LABEL} ${describeExerciseAmount(record.log)}`
  if (after.pendingKcal > 0) return `${head}。あと${formatKcal(after.pendingKcal)}kcalです`
  if (after.eatenKcal === 0) {
    const plan = after.planned[0]
    if (plan) return `${head}。${describePlannedLine(plan)}です`
    return record.kind === 'meshitame' ? describeMeshitameToast() : describeExerciseToast(record.log)
  }
  return `${head}。今月のチートは、ぜんぶなかったことに。`
}

// --- 18-追記 v2.8.1 うごための4つのボタンと時間 ---

// 「うごための時間」で選べる分数：15, 30, …, 120
export function listExercisePresetOptions(): number[] {
  const options: number[] = []
  for (let m = EXERCISE_PRESET_MIN_MINUTES; m <= EXERCISE_PRESET_MAX_MINUTES; m += EXERCISE_PRESET_STEP_MINUTES) options.push(m)
  return options
}

function isValidPresetMinutes(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= EXERCISE_PRESET_MIN_MINUTES &&
    v <= EXERCISE_PRESET_MAX_MINUTES &&
    v % EXERCISE_PRESET_STEP_MINUTES === 0
  )
}

// DBの値（user_profiles.exercise_presets）を読む。足りない・おかしい種類だけ30分にし、知らない種類は捨てる
export function normalizeExercisePresets(raw: unknown): ExercisePresets {
  const obj = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const presets = {} as ExercisePresets
  for (const type of QUICK_EXERCISE_TYPES) {
    const v = obj[type]
    presets[type] = isValidPresetMinutes(v) ? v : EXERCISE_PRESET_DEFAULT_MINUTES
  }
  return presets
}

// 今日の画面の4つのボタン（ウォーキング・ランニング・筋トレ・スポーツの順）
export function buildQuickExercises(presets: ExercisePresets): QuickExercise[] {
  return QUICK_EXERCISE_TYPES.map((type) => ({ type, minutes: presets[type] }))
}

// --- 16. よく食べるもの（直近60日に記録した回数の多い順。頻度ベースで登録済みの品も入れる） ---

export function pickFrequentCheatItems(
  rows: Pick<MonthlyWantRow, 'items' | 'scheduled_date' | 'times_per_week' | 'is_active'>[],
  today: string,
  days = FREQUENT_ITEM_DAYS,
  limit = FREQUENT_ITEM_MAX
): Omit<CheatItemSelection, 'qty'>[] {
  const from = addDaysToDateStr(today, -(days - 1))
  const counts = new Map<string, { item: Omit<CheatItemSelection, 'qty'>; count: number; order: number }>()
  let order = 0
  for (const row of rows) {
    if (row.is_active === false) continue
    const inRange = row.scheduled_date != null && row.scheduled_date >= from && row.scheduled_date <= today
    const frequency = row.scheduled_date == null && (row.times_per_week ?? 0) > 0
    if (!inRange && !frequency) continue
    for (const i of row.items ?? []) {
      const key = `${i.genre}:${i.name}`
      const found = counts.get(key)
      if (found) found.count += 1
      else counts.set(key, { item: { genre: i.genre, name: i.name, kcal: i.kcal }, count: 1, order: order++ })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.item)
}

// --- 12-5. 週（月曜〜日曜・日本時間。月をまたいでも日付で集計する） ---

// 0=日 … 6=土
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// その日を含む週（月曜〜日曜）
export function getWeekRange(dateStr: string): { from: string; to: string } {
  const from = addDaysToDateStr(dateStr, -((weekdayOf(dateStr) + 6) % 7))
  return { from, to: addDaysToDateStr(from, 6) }
}

// 振り返りの週：日曜はその週、月曜は前の週。ほかの曜日は null
export function getReviewWeek(today: string): { from: string; to: string } | null {
  const weekday = weekdayOf(today)
  if (weekday === 0) return getWeekRange(today)
  if (weekday === 1) return getWeekRange(addDaysToDateStr(today, -1))
  return null
}

export function calcWeekSummary(input: {
  from: string // 月曜
  until?: string // 集計の最後の日（今週の途中なら今日）。省略時は日曜まで
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  exerciseLogs: { log_date: string; points: number }[]
  wants: MonthlyWantRow[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
  weightLogs: WeightPoint[]
}): WeekSummary {
  const { from, mealLogs, exerciseLogs, wants, slotTargets, weightLogs } = input
  const sunday = addDaysToDateStr(from, 6)
  const to = input.until && input.until < sunday ? input.until : sunday
  const cheats = listCheatsInRange({ wants, mealLogs, slotTargets, from, to })
  return {
    from,
    to: sunday,
    earned: calcEarnedBreakdown({ from, to, mealLogs, exerciseLogs, replacedMealKeys: getReplacedMealKeys(wants) }),
    cheats,
    cheatKcal: cheats.reduce((sum, c) => sum + c.costKcal, 0),
    weightDiffKg: calcWeekOverWeek(weightLogs, sunday).diffKg,
  }
}

// 「今週は 1,950kcal 貯まりました。飲み会1回ぶんです🍻」。0のときも責めない
export function describeWeekEarned(kcal: number): string {
  if (kcal <= 0) return '今週はひと休み。来週またメシためしていきましょう'
  const eq = pickSavedEquivalent(kcal)
  const head = `今週は ${formatKcal(kcal)}kcal 貯まりました`
  return eq ? `${head}。${eq.label}ぶんです${eq.emoji}` : head
}

// --- 14.3. ログ ---

// 「≒ ビール◯杯ぶん」：生ビール中ジョッキの kcal で割って切り捨て（1杯未満は0 → 画面では出さない）
export function calcBeerEquivalent(kcal: number): number {
  return Math.max(0, Math.floor(kcal / FOOD_ITEM_MAP.draft_beer.kcal))
}

// うごための合計時間（分）。歩数で記録したものは含めない
export function calcExerciseMinutes(
  exerciseLogs: Pick<ExerciseLogRow, 'log_date' | 'exercise_type' | 'minutes'>[],
  from: string,
  to: string
): number {
  return exerciseLogs
    .filter((l) => l.log_date >= from && l.log_date <= to && l.exercise_type !== 'steps')
    .reduce((sum, l) => sum + (l.minutes ?? 0), 0)
}

// 「ウォーキング30分」／「8,000歩」
export function formatExerciseLog(log: Pick<ExerciseLogRow, 'exercise_type' | 'minutes' | 'steps'>): string {
  if (log.exercise_type === 'steps') return `${(log.steps ?? 0).toLocaleString('ja-JP')}歩`
  return `${EXERCISE_TYPE_LABELS[log.exercise_type]}${log.minutes ?? 0}分`
}

// 過去14日分（今日を含む）の一覧。新しい日が上。メシため（light）・チート・うごため。記録がない日は出さない
export function buildLogDays(input: {
  today: string
  mealLogs: MealLogRow[]
  exerciseLogs: ExerciseLogRow[]
  wants?: MonthlyWantRow[]
  slotTargets?: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
  filter: LogFilter
}): LogDay[] {
  const { today, mealLogs, exerciseLogs, filter } = input
  const wants = input.wants ?? []
  const replacedMealKeys = getReplacedMealKeys(wants)
  const from = addDaysToDateStr(today, -(LOG_DAYS - 1))
  const cheats =
    filter === 'all' || filter === 'cheat'
      ? listCheatsInRange({ wants, mealLogs, slotTargets: input.slotTargets ?? [], from, to: today })
      : []
  const days: LogDay[] = []
  for (let d = today; d >= from; d = addDaysToDateStr(d, -1)) {
    const meals: LogEntry[] =
      filter === 'all' || filter === 'meal'
        ? mealLogs
            .filter((l) => l.log_date === d && l.choice === 'light' && !replacedMealKeys.has(`${l.log_date}:${l.slot}`))
            .map((log) => ({ kind: 'meal', log, kcal: TAMEMESHI_PT }))
        : []
    const dayCheats: LogEntry[] = cheats
      .filter((c) => c.date === d)
      .map((cheat) => ({ kind: 'cheat', cheat, kcal: cheat.costKcal }))
    // 朝・昼・夜・追加チートの順（同じ食事はメシため → チート）
    const placed = [...meals, ...dayCheats].sort((a, b) => {
      const place = (e: LogEntry) => (e.kind === 'meal' ? e.log.slot : e.kind === 'cheat' ? e.cheat.place : 'extra')
      return PLACE_ORDER.indexOf(place(a)) - PLACE_ORDER.indexOf(place(b))
    })
    const exercises: LogEntry[] =
      filter === 'all' || filter === 'exercise'
        ? exerciseLogs
            .filter((l) => l.log_date === d)
            .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
            .map((log) => ({ kind: 'exercise', log, kcal: log.points }))
        : []
    const entries = [...placed, ...exercises]
    if (entries.length > 0) days.push({ date: d, entries })
  }
  return days
}

// --- 14.4. 体重チャート：チートの累計（棒）＋体重（線） ---

// 食べたチート：日付のあるチートと品なしの🔥チートを、その日付に。今日より先・頻度ベースは数えない
export function buildCheatEvents(input: {
  wants: MonthlyWantRow[]
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
  from: string
  today: string
}): CheatEvent[] {
  const { wants, mealLogs, slotTargets, from, today } = input
  return listCheatsInRange({ wants, mealLogs, slotTargets, from, to: today }).map((c) => ({
    date: c.date,
    costPt: c.costKcal,
    emoji: getCheatEmoji(c),
    name: getCheatName(c),
    waterHeavy: c.kind === 'hearty' || (c.row !== null && isWaterHeavyRow(c.row)),
  }))
}

// 体重の縦の範囲：中心 ± 2kg。外れる値があるときだけ、収まるように広げる
export function calcWeightYRange(
  values: number[],
  centerKg: number,
  halfRangeKg = CHART_WEIGHT_HALF_RANGE_KG,
  padKg = CHART_WEIGHT_EXPAND_PAD_KG
): { yMin: number; yMax: number } {
  let yMin = centerKg - halfRangeKg
  let yMax = centerKg + halfRangeKg
  if (values.length > 0) {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    if (lo < yMin) yMin = lo - padKg
    if (hi > yMax) yMax = hi + padKg
  }
  return { yMin, yMax }
}

// 期間：今月 = 月の初日〜末日、はじめてから = 最初に体重を記録した日〜今日
export function getCheatChartRange(
  period: CheatChartPeriod,
  today: string,
  firstWeightDate: string | null
): { from: string; to: string } {
  if (period === 'month') return getMonthDateRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
  return { from: firstWeightDate && firstWeightDate < today ? firstWeightDate : today, to: today }
}

export function buildCheatWeightChart(input: {
  period: CheatChartPeriod
  today: string
  weightLogs: Pick<WeightLog, 'measured_at' | 'weight_kg'>[]
  wants: MonthlyWantRow[]
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
}): CheatWeightChartData {
  const { period, today, weightLogs, wants, mealLogs, slotTargets } = input
  const firstWeightDate = weightLogs.reduce<string | null>(
    (min, l) => (min === null || l.measured_at < min ? l.measured_at : min),
    null
  )
  const { from, to } = getCheatChartRange(period, today, firstWeightDate)

  // 棒の区切り：今月は1日ずつ、はじめてからは月曜〜日曜の週ごと（両端は期間で切る）
  const buckets: { from: string; to: string }[] = []
  if (period === 'month') {
    for (let d = from; d <= to; d = addDaysToDateStr(d, 1)) buckets.push({ from: d, to: d })
  } else {
    for (let w = getWeekRange(from).from; w <= to; w = addDaysToDateStr(w, 7)) {
      const end = addDaysToDateStr(w, 6)
      buckets.push({ from: w < from ? from : w, to: end > to ? to : end })
    }
  }

  const events = buildCheatEvents({ wants, mealLogs, slotTargets, from, today })
  let cumulative = 0
  const bars: CheatChartBar[] = buckets.map((b) => {
    const inBucket = events.filter((e) => e.date >= b.from && e.date <= b.to)
    if (b.from > today) return { ...b, cumulativeKcal: null, events: [] }
    cumulative += inBucket.reduce((sum, e) => sum + e.costPt, 0)
    return { ...b, cumulativeKcal: cumulative, events: inBucket }
  })

  // 体重：今月は毎日の点とならした線（7日平均）、はじめてからは週の平均
  const weightPoints: CheatWeightPoint[] = []
  const weightSegments: CheatWeightPoint[][] = []
  let segment: CheatWeightPoint[] = []
  const closeSegment = () => {
    if (segment.length) weightSegments.push(segment)
    segment = []
  }
  bars.forEach((b, index) => {
    if (b.from > today) return
    const until = b.to < today ? b.to : today
    const inBucket = weightLogs.filter((l) => l.measured_at >= b.from && l.measured_at <= until)
    if (period === 'month') {
      for (const l of inBucket) weightPoints.push({ index, kg: Number(l.weight_kg) })
      const { avgKg } = calcWeightAverage(weightLogs, b.from)
      if (avgKg === null) closeSegment()
      else segment.push({ index, kg: avgKg })
    } else if (inBucket.length === 0) {
      closeSegment()
    } else {
      const kg = inBucket.reduce((sum, l) => sum + Number(l.weight_kg), 0) / inBucket.length
      weightPoints.push({ index, kg })
      segment.push({ index, kg })
    }
  })
  closeSegment()

  const center = weightSegments[0]?.[0]?.kg ?? weightPoints[0]?.kg ?? null
  const range =
    center === null
      ? { yMin: null, yMax: null }
      : calcWeightYRange([...weightPoints, ...weightSegments.flat()].map((p) => p.kg), center)

  return {
    period,
    from,
    to,
    bars,
    maxKcal: cumulative,
    weightPoints,
    weightSegments,
    yMin: range.yMin,
    yMax: range.yMax,
    totalKcal: cumulative,
    weightChangeKg: calcWeightChangeInRange(weightLogs, from, today),
  }
}

// --- 10-5. 運動の記録 ---

// 種類×時間（1分あたりのpt）か、歩数（1000歩 = 35pt、端数は切り捨て）
export function calcExercisePoints(
  input: { type: Exclude<ExerciseType, 'steps'>; minutes: number } | { type: 'steps'; steps: number }
): number {
  if (input.type === 'steps') return Math.floor((Math.max(0, input.steps) * PT_PER_1000_STEPS) / 1000)
  return Math.max(0, Math.round(input.minutes)) * EXERCISE_PT_PER_MIN[input.type]
}

// --- 10-7. 過去の日の記録 ---
// 日付はすべて日本時間の YYYY-MM-DD で扱う

// YYYY-MM-DD を days 日ずらす（月・年またぎ対応）
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

// YYYY-MM-DD → その日の日本時間の正午（calcCurrentMonthTargets などに渡す用）
export function dateStrToJSTDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+09:00`)
}

// 記録できる日付の範囲：7日前〜今日（未来は不可）
export function getRecordableDateRange(today: string): { min: string; max: string } {
  return { min: addDaysToDateStr(today, -RECORD_PAST_DAYS), max: today }
}

export function isRecordableDate(dateStr: string, today: string): boolean {
  const { min, max } = getRecordableDateRange(today)
  return dateStr >= min && dateStr <= max
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// 「11/7（土）」
export function formatMonthDayWeekday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = WEEKDAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}/${d}（${weekday}）`
}

// --- 11-1. 毎朝の体重 ---

// 入力欄の文字列 → 0.1kg単位の体重。範囲外・数字でないときは null
export function parseWeightInput(input: string): number | null {
  const value = Number(input.trim().replace(',', '.'))
  if (input.trim() === '' || !Number.isFinite(value)) return null
  if (value < WEIGHT_INPUT_MIN_KG || value > WEIGHT_INPUT_MAX_KG) return null
  return Math.round(value * 10) / 10
}

// --- 11-2. 7日間の平均 ---

type WeightPoint = Pick<WeightLog, 'measured_at' | 'weight_kg'>

// その日を含む直近7日間にある記録の平均（記録がない日は飛ばす。補完しない）
export function calcWeightAverage(logs: WeightPoint[], date: string): WeightAverage {
  const from = addDaysToDateStr(date, -(WEIGHT_AVG_DAYS - 1))
  const inRange = logs.filter((l) => l.measured_at >= from && l.measured_at <= date)
  const count = inRange.length
  const avgKg = count === 0 ? null : inRange.reduce((sum, l) => sum + Number(l.weight_kg), 0) / count
  return { avgKg, count, isReference: count < WEIGHT_AVG_MIN_COUNT }
}

// 前週比 = その日の7日平均 − 7日前の7日平均
export function calcWeekOverWeek(logs: WeightPoint[], date: string): WeekOverWeek {
  const now = calcWeightAverage(logs, date)
  const before = calcWeightAverage(logs, addDaysToDateStr(date, -WEIGHT_AVG_DAYS))
  if (now.avgKg === null || before.avgKg === null) return { diffKg: null, isReference: true }
  return { diffKg: now.avgKg - before.avgKg, isReference: now.isReference || before.isReference }
}

// --- 15.3. 体重が上がった日のひと言 ---

// 前週比が今日・7日前・14日前の3回続けて0.1kg以上の増（四捨五入して0.1kg単位）で、どれも参考値でない
export function isWeightRisingThreeWeeks(logs: WeightPoint[], today: string): boolean {
  for (let i = 0; i < WEIGHT_RISING_WEEKS; i++) {
    const { diffKg, isReference } = calcWeekOverWeek(logs, addDaysToDateStr(today, -WEIGHT_AVG_DAYS * i))
    if (diffKg === null || isReference) return false
    if (Math.round(diffKg * 10) / 10 < WEIGHT_RISING_MIN_KG) return false
  }
  return true
}

// 保存した体重が、その日の前日までの7日間の平均（3件以上。その日の記録は含めない）より0.5kg以上高く、
// かつ順調のときだけ true。3週続けて増えているときは出さない
export function shouldShowWeightReassurance(input: {
  logs: WeightPoint[]
  date: string // 保存した日
  weightKg: number // 保存した体重
  onPace: boolean
  risingThreeWeeks: boolean
}): boolean {
  const { logs, date, weightKg, onPace, risingThreeWeeks } = input
  if (!onPace || risingThreeWeeks) return false
  const prev = calcWeightAverage(logs, addDaysToDateStr(date, -1))
  if (prev.avgKg === null || prev.isReference) return false
  return Math.round((weightKg - prev.avgKg) * 1000) / 1000 >= WEIGHT_REASSURE_DIFF_KG
}

// 前週比の表記（0.1kg単位）。記号は使わない：「0.4kg減」「0.3kg増」「変わらず」
export function formatWeightChange(diffKg: number): string {
  const tenths = Math.round(diffKg * 10)
  if (tenths === 0) return '変わらず'
  const kg = `${(Math.abs(tenths) / 10).toFixed(1)}kg`
  return tenths < 0 ? `${kg}減` : `${kg}増`
}

// --- 11-4. 進捗チャート ---

// --- 13.4・14.4. 期間の体重の変化 ---
// 基準 = 期間の中で最初に体重を記録した日から7日間の記録の平均（3件以上）
// いま = 今日までの直近7日間の記録の平均（3件以上）。基準の期間と重ならないこと
// 条件が揃わないときは null
export function calcWeightChangeInRange(logs: WeightPoint[], from: string, today: string): number | null {
  const inRange = logs
    .filter((l) => l.measured_at >= from && l.measured_at <= today)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  if (inRange.length === 0) return null
  const baseFrom = inRange[0].measured_at
  const baseTo = addDaysToDateStr(baseFrom, WEIGHT_AVG_DAYS - 1)
  const nowFrom = addDaysToDateStr(today, -(WEIGHT_AVG_DAYS - 1))
  if (nowFrom <= baseTo) return null
  const avg = (from: string, to: string) => {
    const xs = inRange.filter((l) => l.measured_at >= from && l.measured_at <= to)
    return xs.length < WEIGHT_AVG_MIN_COUNT ? null : xs.reduce((sum, l) => sum + Number(l.weight_kg), 0) / xs.length
  }
  const base = avg(baseFrom, baseTo)
  const now = avg(nowFrom, today)
  if (base === null || now === null) return null
  return Math.round((now - base) * 1000) / 1000
}

// 月初めからの体重の変化（13.4）
export function calcMonthWeightChange(logs: WeightPoint[], today: string): number | null {
  return calcWeightChangeInRange(logs, `${today.slice(0, 7)}-01`, today)
}

// 0.1kg未満は「変わらず」、それ以外は「0.4kg減」「0.2kg増」
function describeWeightChange(diffKg: number): string {
  return Math.abs(diffKg) < 0.1 ? '変わらず' : formatWeightChange(diffKg)
}

// 体重チャートの右下（14.4）：「体重 1.2kg減」／「体重 変わらず」／「体重 0.2kg増」
export function describeWeightChangeShort(diffKg: number): string {
  return `体重 ${describeWeightChange(diffKg)}`
}

// 「これだけ食べて、月初めから0.4kg減」／「変わらず」（0.1kg未満）／「0.2kg増」
export function describeMonthWeightChange(diffKg: number): string {
  return `これだけ食べて、月初めから${describeWeightChange(diffKg)}`
}

// a から b まで何日か（b − a）
export function daysBetween(a: string, b: string): number {
  const toUTC = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((toUTC(b) - toUTC(a)) / MS_PER_DAY)
}

// 開始月から数えて monthNumber ヶ月目の月末（例：11/8開始の3ヶ月目 → 1/31）
export function getPlanMonthEndDate(startDate: string, monthNumber: number): string {
  const [y, m] = startDate.split('-').map(Number)
  const index = y * 12 + (m - 1) + (monthNumber - 1)
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`
}

// 目標ライン：開始日の開始体重 → 各ゲートの終わりの目標体重
export function buildTargetLine(
  plan: Pick<GoalPlanRow, 'start_date' | 'start_weight_kg' | 'gates'>
): TargetLinePoint[] {
  return [
    { date: plan.start_date, kg: Number(plan.start_weight_kg), gateIndex: null },
    ...plan.gates.map((g) => ({
      date: getPlanMonthEndDate(plan.start_date, g.endMonth),
      kg: g.targetWeightKg,
      gateIndex: g.index,
    })),
  ]
}

// その日の目標ライン上の体重（区切りと区切りの間は日数で直線に結ぶ。開始前・終了後は端の値）
export function getTargetWeightOn(line: WeightChartPoint[], date: string): number {
  if (date <= line[0].date) return line[0].kg
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    if (date <= b.date) {
      const span = daysBetween(a.date, b.date)
      return span === 0 ? b.kg : a.kg + ((b.kg - a.kg) * daysBetween(a.date, date)) / span
    }
  }
  return line[line.length - 1].kg
}

// 今日の7日平均と目標ラインの差。マイナスなら先行
export function calcTargetGap(
  avgKg: number | null,
  line: WeightChartPoint[],
  date: string
): { targetKg: number; diffKg: number; ahead: boolean } | null {
  if (avgKg === null || line.length === 0) return null
  const targetKg = getTargetWeightOn(line, date)
  const diffKg = avgKg - targetKg
  return { targetKg, diffKg, ahead: diffKg <= 0 }
}

// --- 11-5. ゲート達成・3%・5% ---

// 7日平均で、まだ出していない達成を返す（参考値＝記録3件未満のときは出さない）
export function detectNewMilestones(
  plan: Pick<GoalPlanRow, 'start_weight_kg' | 'gates'>,
  avg: WeightAverage,
  achieved: ReadonlySet<string>
): Milestone[] {
  if (avg.avgKg === null || avg.isReference) return []
  const avgKg = avg.avgKg
  const startKg = Number(plan.start_weight_kg)
  const lossKg = startKg - avgKg
  const found: Milestone[] = []

  for (const g of plan.gates) {
    const kind: MilestoneKind = `gate${g.index}`
    if (!achieved.has(kind) && avgKg <= g.targetWeightKg + EPSILON) {
      found.push({ kind, title: `${g.endMonth}ヶ月目の目標体重に届きました`, message: `開始から ${lossKg.toFixed(1)}kg 減った。この調子でいこう` })
    }
  }
  for (const h of HEALTH_MILESTONES) {
    if (!achieved.has(h.kind) && lossKg >= startKg * h.ratio - EPSILON) {
      found.push({ kind: h.kind, title: `開始から${Math.round(h.ratio * 100)}%減`, message: h.message })
    }
  }
  return found
}

// --- 17. v2.7 戻り予報 ---
// チートのあとに増える1〜2kgは、ほとんどが糖質と塩分にともなう水分。「いつごろ戻るか」を日付で見せる
// 判定はアイテム表の印（lib/foodItems.ts の waterHeavy）と決まったルールだけ。保存した記録から毎回計算する

type MealLogLike = { log_date: string; slot: MealSlot; choice: MealChoice }
type WaterItem = { key: string; name: string; emoji: string }
type WaterSources = { items: WaterItem[]; hearty: boolean }

// 品がむくみやすいか。辞書にない品（自由入力）は中身がわからないので、むくみやすいとして扱う
function isWaterHeavyItem(item: Pick<CheatItemSelection, 'genre' | 'name'>): boolean {
  const food = CHEAT_ITEM_FOOD.get(`${item.genre}:${item.name}`)
  return food ? FOOD_ITEM_MAP[food.foodId].waterHeavy === true : true
}

// チートの行のむくみやすい品。名前は辞書の名前から（…）を外したもの（自由入力は入れた名前）
// 品が入っていない古い行は中身がわからないので、行そのものを1つの品として扱う
function waterHeavyItemsOfRow(row: Pick<MonthlyWantRow, 'id' | 'items' | 'kind' | 'label'>): WaterItem[] {
  if (!row.items?.length) {
    return [{ key: `row:${row.id}`, name: row.label || WANT_KIND_LABELS[row.kind], emoji: WANT_KIND_EMOJI[row.kind] }]
  }
  return row.items.filter(isWaterHeavyItem).map((i) => {
    const key = `${i.genre}:${i.name}`
    const food = CHEAT_ITEM_FOOD.get(key)
    return {
      key,
      name: food ? shortFoodName(FOOD_ITEM_MAP[food.foodId].name) : i.name,
      emoji: genreDef(i.genre)?.emoji ?? WANT_KIND_EMOJI[row.kind],
    }
  })
}

// 印つきの品を1つ以上含むチートの行か（食事のチートでも追加チートでも）
export function isWaterHeavyRow(row: Pick<MonthlyWantRow, 'id' | 'items' | 'kind' | 'label'>): boolean {
  return waterHeavyItemsOfRow(row).length > 0
}

// 日ごとの、その日をむくみやすい日にしたもの（印つきの品・自由入力の品・品なしの🔥チート）。until の日まで
// 品つきのチートがある食事の hearty は品なしとして扱わない。予定のチートはその日が来るまで数えない（until を今日までにする）
function listWaterSourcesByDay(input: { wants: MonthlyWantRow[]; mealLogs: MealLogLike[]; until: string }): Map<string, WaterSources> {
  const { wants, mealLogs, until } = input
  const byDay = new Map<string, WaterSources>()
  const at = (date: string) => {
    if (!byDay.has(date)) byDay.set(date, { items: [], hearty: false })
    return byDay.get(date) as WaterSources
  }
  for (const r of wants) {
    if (!isDatedCheat(r) || (r.scheduled_date as string) > until) continue
    const items = waterHeavyItemsOfRow(r)
    if (items.length > 0) at(r.scheduled_date as string).items.push(...items)
  }
  for (const h of expandHeartyCheats(mealLogs, '0000-01-01', until, getReplacedMealKeys(wants))) at(h.date).hearty = true
  return byDay
}

// むくみやすい日（日付順）。until（ふつうは今日）より後は数えない
export function listWaterHeavyDays(input: { wants: MonthlyWantRow[]; mealLogs: MealLogLike[]; until: string }): string[] {
  return [...listWaterSourcesByDay(input).keys()].sort()
}

// 直近のまとまり・何日目・戻りそうな日・基準（v2.8 のフレンドでも使う）
// まとまり = 見ている日（date）までで、いちばん新しいむくみやすい日から、あいだを空けずに続いている日
// 基準 = まとまりの最初の日の前日までの7日平均（記録3件未満は null）。前のチートの水分を入れないため
// チート後の記録 = まとまりの最初の日の翌日以降（最初の日の朝は食べる前の体重なので使わない）〜見ている日
// むくみやすい日がなければ null
export function calcWaterRetention(input: {
  wants: MonthlyWantRow[]
  mealLogs: MealLogLike[]
  weightLogs: Pick<WeightLog, 'measured_at' | 'weight_kg'>[]
  date: string
  today: string
}): WaterRetention | null {
  const { wants, mealLogs, weightLogs, date, today } = input
  const days = new Set(listWaterHeavyDays({ wants, mealLogs, until: date < today ? date : today }))
  if (days.size === 0) return null
  const lastDate = [...days].sort().at(-1) as string
  let firstDate = lastDate
  while (days.has(addDaysToDateStr(firstDate, -1))) firstDate = addDaysToDateStr(firstDate, -1)
  const dayNumber = daysBetween(lastDate, date)
  const base = calcWeightAverage(weightLogs, addDaysToDateStr(firstDate, -1))
  return {
    date,
    firstDate,
    lastDate,
    days: daysBetween(firstDate, lastDate) + 1,
    dayNumber,
    returnDate: addDaysToDateStr(lastDate, WATER_RETURN_DAYS),
    inReturnPeriod: dayNumber >= 1 && dayNumber <= WATER_RETURN_DAYS,
    baselineKg: base.avgKg === null || base.isReference ? null : base.avgKg,
    afterLogs: weightLogs
      .filter((l) => l.measured_at > firstDate && l.measured_at <= date)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
  }
}

// 文中の日付：今日と同じ月なら「26日」、違う月なら「12月2日」
export function formatDayInText(date: string, today: string): string {
  const d = dayOf(date)
  return date.slice(0, 7) === today.slice(0, 7) ? `${d}日` : `${Number(date.slice(5, 7))}月${d}日`
}

// 基準との差（小数の誤差を丸める）
function diffFromBaseline(kg: number, baselineKg: number): number {
  return Math.round((Number(kg) - baselineKg) * 1000) / 1000
}

// 今日の画面のカードの下（今日がむくみやすい日のとき）
export function describeWaterTodayLine(today: string): string {
  const back = formatDayInText(addDaysToDateStr(today, WATER_RETURN_DAYS), today)
  return `明日は1〜2kg増えるかもしれません。水分なので、${back}ごろには戻りそうです。`
}

// 体重を保存した直後のトースト（保存した日が1〜5日目のときだけ）。当てはまらなければ null（v2.5 のルールに戻す）
// 1. 戻った：前回の記録（チート後の記録のうち今回より前で最後）が基準＋0.3kg以上で、今回が基準＋0.2kg以下
// 2. 増えている（1〜3日目）：今回が基準＋0.3kg以上 → 続いている（2日以上・順調）／順調／順調でない（あと◯kcal）
export function describeWaterReturnToast(input: {
  retention: WaterRetention | null
  weightKg: number
  onTrack: boolean
  pendingKcal: number
  today: string
}): string | null {
  const { retention: r, weightKg, onTrack, pendingKcal, today } = input
  if (!r || r.baselineKg === null) return null
  if (r.dayNumber < 1 || r.dayNumber > WATER_TOAST_MAX_DAY) return null
  const now = diffFromBaseline(weightKg, r.baselineKg)
  const prev = r.afterLogs.filter((l) => l.measured_at < r.date).at(-1)
  if (prev && diffFromBaseline(prev.weight_kg, r.baselineKg) >= WATER_UP_KG && now <= WATER_BACK_KG) {
    return 'もとに戻りました。メシためはちゃんと効いてます。'
  }
  if (r.dayNumber > WATER_RETURN_DAYS || now < WATER_UP_KG) return null
  const back = formatDayInText(r.returnDate, today)
  if (onTrack && r.days >= 2) return `水分が続いているだけです。${back}ごろには戻りそうです。`
  if (onTrack) return `増えたのは水分です。${back}ごろには戻りそう。${CHEAT_CARD_ON_TRACK}。`
  return `増えたのは水分です。${back}ごろには戻りそう。あと${formatKcal(pendingKcal)}kcalで、なかったことにできます。`
}

// 体重タブの行のチート名：まとまりの最後の日をむくみやすい日にしたもの。品が1つならその名前、それ以外は「チート」
export function getWaterCheatName(input: { wants: MonthlyWantRow[]; mealLogs: MealLogLike[]; date: string }): string {
  const sources = listWaterSourcesByDay({ ...input, until: input.date }).get(input.date)
  const items = new Map((sources?.items ?? []).map((i) => [i.key, i.name]))
  return items.size === 1 && !sources?.hearty ? [...items.values()][0] : 'チート'
}

// むくみ中：戻り期間中で、最新のチート後の記録が基準＋0.3kg以上（体重タブの行・コースで使う）
export function isWaterSwollen(r: WaterRetention): boolean {
  if (!r.inReturnPeriod || r.baselineKg === null) return false
  const latest = r.afterLogs.at(-1)
  return !!latest && diffFromBaseline(latest.weight_kg, r.baselineKg) >= WATER_UP_KG
}

// 体重タブの記録カードの下：「ラーメンから2日目。26日ごろには戻りそうです。」
// 戻り期間中で、最新のチート後の記録が基準＋0.3kg以上のときだけ。それ以外は null
export function describeWaterReturnLine(input: {
  retention: WaterRetention | null
  wants: MonthlyWantRow[]
  mealLogs: MealLogLike[]
  today: string
}): string | null {
  const { retention: r, wants, mealLogs, today } = input
  if (!r || !isWaterSwollen(r)) return null
  const name = getWaterCheatName({ wants, mealLogs, date: r.lastDate })
  return `${name}から${r.dayNumber}日目。${formatDayInText(r.returnDate, today)}ごろには戻りそうです。`
}

// --- 18. v2.8 フレンドと一緒に食べる約束 ---
// 友だちに見せるのは「頑張っていること」と「目標体重への近づき具合（%）」だけ。kg はどこにも出さない

// 近づき具合(%) =（始めた体重 − いまの体重）÷（始めた体重 − 目標体重）× 100。0〜100 の整数
// 目標体重がない、または始めた体重 ≦ 目標体重なら null（コースに置かない）
export function calcApproachPct(startKg: number, nowKg: number, targetKg: number | null): number | null {
  if (targetKg === null || !(startKg > targetKg)) return null
  const pct = ((startKg - nowKg) / (startKg - targetKg)) * 100
  return Math.min(100, Math.max(0, Math.round(pct)))
}

// ならした体重：その日の7日平均。7日間に記録がなければ、それより前で最後に記録した日の7日平均
export function getSmoothedWeight(logs: WeightPoint[], date: string): number | null {
  const avg = calcWeightAverage(logs, date).avgKg
  if (avg !== null) return avg
  const last = logs.filter((l) => l.measured_at <= date).reduce<string | null>((m, l) => (m === null || l.measured_at > m ? l.measured_at : m), null)
  return last === null ? null : calcWeightAverage(logs, last).avgKg
}

// 始めた日：最初に体重を記録した日（v2.4 の「はじめてから」と同じ起点）
function firstWeightLog(logs: WeightPoint[]): WeightPoint | null {
  return logs.reduce<WeightPoint | null>((m, l) => (m === null || l.measured_at < m.measured_at ? l : m), null)
}

// その日の近づき具合
export function calcApproachOn(logs: WeightPoint[], targetKg: number | null, date: string): number | null {
  const first = firstWeightLog(logs)
  if (!first || date < first.measured_at) return null
  const now = getSmoothedWeight(logs, date)
  return now === null ? null : calcApproachPct(Number(first.weight_kg), now, targetKg)
}

// むくみ中の絵文字：まとまりの最後の日の品が1つならその品の絵文字、2つ以上か品なしの🔥チートなら🔥
export function getWaterCheatEmoji(input: { wants: MonthlyWantRow[]; mealLogs: MealLogLike[]; date: string }): string {
  const sources = listWaterSourcesByDay({ ...input, until: input.date }).get(input.date)
  const items = new Map((sources?.items ?? []).map((i) => [i.key, i.emoji]))
  return items.size === 1 && !sources?.hearty ? [...items.values()][0] : MEAL_CHOICE_EMOJI.hearty
}

// コースの位置と一言
// むくみ中：近づき具合はまとまりの最初の日の前日の値で止める（チートで後ろに下がって見えないように）
// ちょっと寄り道中：むくみ中でなく、7日前の近づき具合より下がっている
export function calcCourseStatus(input: {
  logs: WeightPoint[]
  targetKg: number | null
  wants: MonthlyWantRow[]
  mealLogs: MealLogLike[]
  today: string
}): Pick<FriendProgressData, 'approachPct' | 'detour' | 'waterEmoji' | 'waterReturnDate'> {
  const { logs, targetKg, wants, mealLogs, today } = input
  const retention = calcWaterRetention({ wants, mealLogs, weightLogs: logs, date: today, today })
  if (retention && isWaterSwollen(retention)) {
    return {
      approachPct: calcApproachOn(logs, targetKg, addDaysToDateStr(retention.firstDate, -1)),
      detour: false,
      waterEmoji: getWaterCheatEmoji({ wants, mealLogs, date: retention.lastDate }),
      waterReturnDate: retention.returnDate,
    }
  }
  const now = calcApproachOn(logs, targetKg, today)
  const weekAgo = calcApproachOn(logs, targetKg, addDaysToDateStr(today, -WEIGHT_AVG_DAYS))
  return {
    approachPct: now,
    detour: now !== null && weekAgo !== null && now < weekAgo,
    waterEmoji: null,
    waterReturnDate: null,
  }
}

// 月の一覧（from の月〜to の月）
function monthsBetween(from: string, to: string): { year: number; month: number }[] {
  const list: { year: number; month: number }[] = []
  let m = { year: Number(from.slice(0, 4)), month: Number(from.slice(5, 7)) }
  const end = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7))
  while (m.year * 12 + m.month <= end) {
    list.push(m)
    m = shiftMonth(m.year, m.month, 1)
  }
  return list
}

type CheatHistoryInput = {
  wants: MonthlyWantRow[]
  mealLogs: MealLogLike[]
  exerciseLogs: { log_date: string; points: number }[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
  today: string
}

// 始めた日〜今日のチートと、それぞれの見え方（v2.6・v2.6.1 の順番と持ち越しのルールを月ごとに使う）
// その月になかったことにした → cleared。できなかったものは翌月に持ち越し、翌月の持ち越しの分がなかったことになれば cleared
// 持ち越しが今月 → pending。持ち越した月が終わってもなかったことにできなかった → gone
// 一部だけ当たったチートは、まるごと「まだ」として扱う
export function listCheatLooks(input: CheatHistoryInput & { from: string }): { cheat: MonthCheat; look: FootprintLook }[] {
  const { from, today } = input
  if (from > today) return []
  const currentKey = today.slice(0, 7)
  const statuses = new Map<string, MonthCheatStatus>()
  const statusOf = (m: { year: number; month: number }) => {
    const key = monthPrefix(m.year, m.month)
    if (!statuses.has(key)) {
      const end = getMonthDateRange(m.year, m.month).to
      statuses.set(key, calcMonthCheatStatus({ ...input, year: m.year, month: m.month, today: end < today ? end : today }))
    }
    return statuses.get(key) as MonthCheatStatus
  }
  const result: { cheat: MonthCheat; look: FootprintLook }[] = []
  for (const m of monthsBetween(from, today)) {
    const status = statusOf(m)
    const key = monthPrefix(m.year, m.month)
    const next = shiftMonth(m.year, m.month, 1)
    const nextKey = monthPrefix(next.year, next.month)
    for (const e of status.entries) {
      if (e.cheat.kind === 'carryover' || e.cheat.date < from) continue
      let look: FootprintLook
      if (e.cleared) look = 'cleared'
      else if (key === currentKey) look = 'pending'
      else {
        const carried = statusOf(next).entries.find((x) => x.cheat.kind === 'carryover')
        look = carried?.cleared ? 'cleared' : nextKey === currentKey ? 'pending' : 'gone'
      }
      result.push({ cheat: e.cheat, look })
    }
  }
  return result
}

// 足あと：そのチートを食べた日の近づき具合の位置に、品の絵文字（品なしの🔥チートは🔥）
// 新しいものから30個まで。同じ位置・絵文字・見え方のものは「🍺×3」にまとめる
export function buildFootprints(
  looks: { cheat: MonthCheat; look: FootprintLook }[],
  logs: WeightPoint[],
  targetKg: number | null
): Footprint[] {
  const newest = [...looks].sort((a, b) => compareCheats(b.cheat, a.cheat)).slice(0, FOOTPRINT_MAX)
  const result: Footprint[] = []
  for (const { cheat, look } of newest) {
    const pct = calcApproachOn(logs, targetKg, cheat.date)
    if (pct === null) continue
    const emoji = getCheatEmoji(cheat)
    const same = result.find((f) => f.pct === pct && f.emoji === emoji && f.look === look)
    if (same) same.count += 1
    else result.push({ pct, emoji, count: 1, look })
  }
  return result
}

// チートの数の集計：品の数量（ジャンルの絵文字ごと）と、品なしの🔥チートの回数。多い順（同じ数なら先に出たもの）
// 予定のチートは数えない（cheats は今日までのもの）
export function countCheatEmojis(cheats: MonthCheat[]): CheatCount[] {
  const counts = new Map<string, number>()
  const add = (emoji: string, n: number) => counts.set(emoji, (counts.get(emoji) ?? 0) + n)
  for (const c of cheats) {
    if (c.kind === 'carryover') continue
    if (c.kind === 'hearty' || !c.row) {
      add(MEAL_CHOICE_EMOJI.hearty, 1)
      continue
    }
    const row = c.row
    if (!row.items?.length) add(WANT_KIND_EMOJI[row.kind], 1)
    else for (const i of row.items) add(genreDef(i.genre)?.emoji ?? WANT_KIND_EMOJI[row.kind], i.qty)
  }
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count)
}

// 隠す設定：足あと・チートの数・むくみ中の絵文字をすべて🍽に（書き出す前に本人の画面で置き換える）
export function hideCheatContents(data: FriendProgressData): FriendProgressData {
  const footprints: Footprint[] = []
  for (const f of data.footprints) {
    const same = footprints.find((x) => x.pct === f.pct && x.look === f.look)
    if (same) same.count += f.count
    else footprints.push({ ...f, emoji: HIDDEN_CHEAT_EMOJI })
  }
  const total = data.cheatCounts.reduce((sum, c) => sum + c.count, 0)
  return {
    ...data,
    footprints,
    cheatCounts: total > 0 ? [{ emoji: HIDDEN_CHEAT_EMOJI, count: total }] : [],
    waterEmoji: data.waterEmoji === null ? null : HIDDEN_CHEAT_EMOJI,
  }
}

// friend_progress に書き出す中身。始めた日（最初に体重を記録した日）から今日まで
export function buildFriendProgress(
  input: CheatHistoryInput & { logs: WeightPoint[]; targetKg: number | null; hide: boolean }
): FriendProgressData {
  const { logs, targetKg, hide, today } = input
  const first = firstWeightLog(logs)
  const course = calcCourseStatus({ ...input })
  const looks = first ? listCheatLooks({ ...input, from: first.measured_at }) : []
  const data: FriendProgressData = {
    ...course,
    footprints: course.approachPct === null ? [] : buildFootprints(looks, logs, targetKg),
    cheatCounts: first
      ? countCheatEmojis(listCheatsInRange({ ...input, from: first.measured_at, to: today }))
      : [],
  }
  const shown = hide ? hideCheatContents(data) : data
  return { ...shown, cheatCounts: shown.cheatCounts.slice(0, CHEAT_COUNT_MAX_KINDS) }
}

// 約束までの準備の具合（0〜100%）：v2.6 の「予定の準備」と同じく、余りを今月の予定に日付順に当て、その約束に当たった割合
// 約束の当日は、食べた分の並びで同じように出す。約束の月がまだ始まっていなければ null。チートが見つからなければ null
// チートが0kcal（食事の目安以下）なら100%
export function calcPromiseReadiness(status: MonthCheatStatus, cheatId: string | null, promiseDate: string, today: string): number | null {
  if (!cheatId || promiseDate.slice(0, 7) !== today.slice(0, 7) || promiseDate < today) return null
  const pct = (covered: number, cost: number) => (cost <= 0 ? 100 : Math.floor((covered / cost) * 100))
  if (promiseDate === today) {
    const e = status.entries.find((x) => x.cheat.key === cheatId)
    if (!e) return null
    const cost = e.cheat.costKcal
    return pct(Math.min(cost, Math.max(0, status.savedKcal - (e.cumulativeKcal - cost))), cost)
  }
  const plan = status.planned.find((x) => x.cheat.key === cheatId)
  if (!plan) return null
  const cost = plan.cheat.costKcal
  return pct(cost - Math.min(cost, plan.shortKcal), cost)
}

// 約束の月がまだ始まっていない
export function isPromiseMonthAhead(promiseDate: string, today: string): boolean {
  return promiseDate.slice(0, 7) > today.slice(0, 7)
}

// 「12月に入ったら貯めはじめ」
export function describePromiseNotStarted(promiseDate: string): string {
  return `${Number(promiseDate.slice(5, 7))}月に入ったら貯めはじめ`
}

// 全員が100%（みんな準備OK）
export function isPromiseAllReady(readiness: (number | null)[]): boolean {
  return readiness.length > 0 && readiness.every((r) => r === 100)
}

// 約束の日付：明日から60日以内
export function getPromiseDateRange(today: string): { min: string; max: string } {
  return { min: addDaysToDateStr(today, 1), max: addDaysToDateStr(today, PROMISE_MAX_DAYS_AHEAD) }
}

export function isValidPromiseDate(date: string, today: string): boolean {
  const { min, max } = getPromiseDateRange(today)
  return date >= min && date <= max
}

// 約束を「これから」「これまで」に分ける。これまでは約束の日から30日たったら隠す。取りやめたものもこれまでに
export function splitPromises<T extends { promise_date: string; status: string }>(
  promises: T[],
  today: string
): { upcoming: T[]; past: T[] } {
  const hideBefore = addDaysToDateStr(today, -PROMISE_PAST_VISIBLE_DAYS)
  const byDate = [...promises].sort((a, b) => a.promise_date.localeCompare(b.promise_date))
  return {
    upcoming: byDate.filter((p) => p.status === 'active' && p.promise_date >= today),
    past: byDate
      .filter((p) => (p.status !== 'active' || p.promise_date < today) && p.promise_date >= hideBefore)
      .reverse(),
  }
}

// 約束の絵文字：最初の品のジャンルの絵文字（品がなければ★）
export function getPromiseEmoji(items: Pick<CheatItemSelection, 'genre'>[]): string {
  return (items[0] && genreDef(items[0].genre)?.emoji) || WANT_KIND_EMOJI.other
}

// 「🍖 20日の焼肉まで、あと27日」／当日は「🍖 今日は焼肉の日」
export function describePromiseLine(
  promise: { promise_date: string; label: string; items: Pick<CheatItemSelection, 'genre'>[] },
  today: string
): string {
  const emoji = getPromiseEmoji(promise.items)
  if (promise.promise_date === today) return `${emoji} 今日は${promise.label}の日`
  return `${emoji} ${formatDayInText(promise.promise_date, today)}の${promise.label}まで、あと${daysBetween(today, promise.promise_date)}日`
}

// 約束の名前：「20日の焼肉」
export function describePromiseName(promise: { promise_date: string; label: string }, today: string): string {
  return `${formatDayInText(promise.promise_date, today)}の${promise.label}`
}

// コースの各レーンの下：「🍺×12 🍜×3 食べて、目標体重まで45%」
export function describeCourseLine(counts: CheatCount[], approachPct: number): string {
  const eaten = counts.map((c) => `${c.emoji}×${c.count}`).join(' ')
  return eaten ? `${eaten} 食べて、目標体重まで${approachPct}%` : `目標体重まで${approachPct}%`
}

// 名前の横：「🍜むくみ中・26日ごろ戻りそう」
export function describeWaterBadge(emoji: string, returnDate: string, today: string): string {
  return `${emoji}むくみ中・${formatDayInText(returnDate, today)}ごろ戻りそう`
}
