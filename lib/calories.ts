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
  MonthCheatEntry,
  MeshipoGauge,
  WeightLog,
  WeightAverage,
  WeekOverWeek,
  MonthTargets,
  MonthTargetBasis,
  MonthlyTargetRow,
  ChartPeriod,
  TargetLinePoint,
  WeightChartData,
  WeightChartPoint,
  Milestone,
  MilestoneKind,
  ReducePace,
  HeartyCheatEntry,
  GaugeCheatEntry,
  EarnedBreakdown,
  WeekSummary,
  DatedCheatEntry,
  ZeroCalEntry,
  ZeroCalStatus,
  GaugeMarker,
  RewardPick,
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
} from '@/types'
import {
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  EXERCISE_TYPE_LABELS,
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
  CHART_PERIOD_DAYS,
  CHART_Y_PADDING_KG,
  HEALTH_MILESTONES,
  ZERO_CAL_HEADLINE_MAX,
  GAUGE_MARKER_MIN_GAP,
  REWARD_MIN_KCAL,
  LOG_DAYS,
  CHART_WEIGHT_HALF_RANGE_KG,
  CHART_WEIGHT_EXPAND_PAD_KG,
} from '@/lib/calorieConstants'
import { REWARD_ITEMS, type RewardItem } from '@/lib/rewardItems'
import { CHEAT_GENRE_MAP, type CheatGenre, type CheatItem } from '@/lib/cheatItems'
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

// 置き換え：合計 − その食事の目安（下回るときは0。チートでptは増えない）/ 上乗せ：合計
export function calcCheatCost(cheatType: CheatType, totalKcal: number, slotTargetKcal: number): number {
  return cheatType === 'replace' ? Math.max(0, totalKcal - slotTargetKcal) : totalKcal
}

function genreDef(genre: string) {
  return CHEAT_GENRE_MAP[genre as CheatGenre] ?? null
}

// 初期タイプ = 最初に選んだアイテムのジャンルのタイプ
export function getDefaultCheatType(items: Pick<CheatItemSelection, 'genre'>[]): CheatType {
  return (items.length > 0 && genreDef(items[0].genre)?.defaultType) || 'replace'
}

// 既存の kind 列に入れる値（最初のアイテムのジャンルから）
export function getCheatKind(items: Pick<CheatItemSelection, 'genre'>[]): WantKind {
  return (items.length > 0 && genreDef(items[0].genre)?.kind) || 'other'
}

// 一覧に出す名前（例：家系＋ライス、ビール500ml×2＋唐揚げ）
export function buildCheatLabel(items: Pick<CheatItemSelection, 'name' | 'qty'>[]): string {
  return items.map((i) => (i.qty > 1 ? `${i.name}×${i.qty}` : i.name)).join('＋')
}

// 「このチートは ◯pt ＝ メシため◯回 or ウォーキング◯分」
export function convertCheatCost(costPt: number): { tamemeshi: number; walkingMinutes: number } {
  const pt = Math.max(0, costPt)
  return {
    tamemeshi: Math.ceil(pt / TAMEMESHI_PT),
    walkingMinutes: Math.ceil(pt / EXERCISE_PT_PER_MIN.walking),
  }
}

// 登録済みチート1回分のコスト。中身を選んでいない行は WANT_COSTS をデフォルトに使う
// 置き換えの食事が未指定なら夜として扱う
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

// --- 10-4. ゲージは「月で1本」 ---

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// 頻度ベース（週◯回）がその月に入る回数 = 週の回数 × 月の日数 ÷ 7 を四捨五入
export function countFrequencyInMonth(timesPerWeek: number, year: number, month: number): number {
  return Math.round((timesPerWeek * getDaysInMonth(year, month)) / 7)
}

// その月のチート一覧。日付指定は日付順、その後ろに頻度ベース。今日より前の日付指定は済み
export function expandCheatsForMonth(
  rows: MonthlyWantRow[],
  year: number,
  month: number,
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[],
  today: string // YYYY-MM-DD（日本時間）
): MonthCheatEntry[] {
  const prefix = monthPrefix(year, month)
  const active = rows.filter((r) => r.is_active !== false)

  const dated: MonthCheatEntry[] = active
    .filter((r) => r.scheduled_date != null && r.scheduled_date.startsWith(prefix))
    .sort((a, b) => (a.scheduled_date as string).localeCompare(b.scheduled_date as string))
    .map((row) => ({
      mode: 'dated',
      row,
      date: row.scheduled_date as string,
      costPt: getMonthlyWantRowCost(row, slotTargets),
      done: (row.scheduled_date as string) < today,
    }))

  const frequency: MonthCheatEntry[] = active
    .filter((r) => r.scheduled_date == null && (r.times_per_week ?? 0) > 0)
    .map((row) => {
      const timesPerWeek = row.times_per_week as number
      const timesInMonth = countFrequencyInMonth(timesPerWeek, year, month)
      const costPerTimePt = getMonthlyWantRowCost(row, slotTargets)
      return { mode: 'frequency', row, timesPerWeek, timesInMonth, costPerTimePt, costPt: costPerTimePt * timesInMonth }
    })

  return [...dated, ...frequency]
}

export function sumMonthCheatCosts(entries: Pick<MonthCheatEntry, 'costPt'>[]): number {
  return entries.reduce((sum, e) => sum + e.costPt, 0)
}

// 置き換えのチートが入っている「日付:食事」（その食事の記録はptに入れない）
// 日付のない頻度ベースは対象外
export function getReplacedMealKeys(
  rows: Pick<MonthlyWantRow, 'scheduled_date' | 'cheat_type' | 'replace_slot' | 'is_active'>[]
): Set<string> {
  const keys = new Set<string>()
  for (const r of rows) {
    if (r.is_active === false || !r.scheduled_date || r.cheat_type !== 'replace') continue
    keys.add(`${r.scheduled_date}:${r.replace_slot ?? 'dinner'}`)
  }
  return keys
}

// --- 12-2. がっつりはチートとして目標に足す ---

// がっつりの記録をチートの行にする（DBには作らない）。日付・食事の順
// 置き換えのチートが入っている食事（★チート表示）のがっつりは数えない（置き換えのコストと二重にしない）
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

// その月の初日・末日
export function getMonthDateRange(year: number, month: number): { from: string; to: string } {
  const prefix = monthPrefix(year, month)
  return { from: `${prefix}-01`, to: `${prefix}-${String(getDaysInMonth(year, month)).padStart(2, '0')}` }
}

// ゲージの目標に入るチート：登録したチート ＋ その月のがっつり
export function buildGaugeCheats(
  cheats: MonthCheatEntry[],
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[],
  year: number,
  month: number,
  replacedMealKeys?: Set<string>
): GaugeCheatEntry[] {
  const { from, to } = getMonthDateRange(year, month)
  return [...cheats, ...expandHeartyCheats(mealLogs, from, to, replacedMealKeys)]
}

// --- 12-2. 貯まったpt = ためメシ × 150 ＋ 運動pt ---
// いつもの・記録なしは0pt。がっつりは引かない（目標に足す）
// 置き換えたチートがある食事の記録は数えない

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
  const exercisePt = exerciseLogs.filter((l) => inRange(l.log_date)).reduce((sum, l) => sum + l.points, 0)
  return { tamemeshiCount, tamemeshiPt, exercisePt, totalPt: tamemeshiPt + exercisePt }
}

// その月の今日までの内訳（どの日の分も同じ月のプールに入る）
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

export function calcMeshipoGauge(input: {
  targetPt: number
  earnedPt: number
  dayOfMonth: number // 今日が何日目か（今日を含む）
  daysInMonth: number
}): MeshipoGauge {
  const { targetPt, earnedPt, dayOfMonth, daysInMonth } = input
  const pacePt = Math.round((targetPt * dayOfMonth) / daysInMonth)
  const behindPt = Math.max(0, pacePt - earnedPt)
  return {
    targetPt,
    earnedPt,
    pacePt,
    onPace: behindPt === 0,
    behindPt,
    catchUpWalkingMinutes: Math.ceil(behindPt / EXERCISE_PT_PER_MIN.walking),
    extraPt: Math.max(0, earnedPt - targetPt),
    tamemeshiNeeded: Math.max(0, Math.ceil((targetPt - earnedPt) / TAMEMESHI_PT)),
    fillRatio: targetPt > 0 ? Math.min(1, Math.max(0, earnedPt / targetPt)) : 1,
    paceRatio: Math.min(1, dayOfMonth / daysInMonth),
  }
}

// --- 12-5. 週の振り返り（月曜〜日曜・日本時間。月をまたいでも日付で集計する） ---

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

// 振り返りカードを出す週：日曜はその週、月曜は前の週。ほかの曜日は null
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
  const active = wants.filter((r) => r.is_active !== false)
  const replacedMealKeys = getReplacedMealKeys(active)

  const dated: DatedCheatEntry[] = active
    .filter((r) => r.scheduled_date != null && r.scheduled_date >= from && r.scheduled_date <= to)
    .sort((a, b) => (a.scheduled_date as string).localeCompare(b.scheduled_date as string))
    .map((row) => ({
      mode: 'dated',
      row,
      date: row.scheduled_date as string,
      costPt: getMonthlyWantRowCost(row, slotTargets),
      done: true,
    }))
  const cheats: WeekSummary['cheats'] = [...dated, ...expandHeartyCheats(mealLogs, from, to, replacedMealKeys)].sort(
    (a, b) => a.date.localeCompare(b.date)
  )
  const frequencyCheats = active
    .filter((r) => r.scheduled_date == null && (r.times_per_week ?? 0) > 0)
    .map((row) => {
      const timesPerWeek = row.times_per_week as number
      return { row, timesPerWeek, costPt: getMonthlyWantRowCost(row, slotTargets) * timesPerWeek }
    })

  return {
    from,
    to: sunday,
    earned: calcEarnedBreakdown({ from, to, mealLogs, exerciseLogs, replacedMealKeys }),
    cheats,
    frequencyCheats,
    cheatPt: cheats.reduce((sum, e) => sum + e.costPt, 0) + frequencyCheats.reduce((sum, e) => sum + e.costPt, 0),
    weightDiffKg: calcWeekOverWeek(weightLogs, sunday).diffKg,
  }
}

// 「今週は+600pt！ワイン1本ぶん貯まりました🍷」。0ptのときも責めない
export function describeWeekEarned(pt: number): string {
  if (pt <= 0) return '今週はひと休み。来週のメシためでまた貯めていこう'
  const eq = [...WEEK_EARNED_EQUIVALENTS].reverse().find((e) => e.pt <= pt)
  if (!eq) return `今週は+${pt}pt！コツコツ貯まっています`
  return `今週は+${pt}pt！${eq.label}ぶん貯まりました${eq.emoji}`
}

// --- 13.3. ゼロカロ化（pt ≒ kcal。貯まったpt = 実質0kcalにできたkcal） ---

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

// 「🔥がっつり（11/9 夜）」
export function heartyCheatLabel(date: string, slot: MealSlot): string {
  return `${MEAL_CHOICE_EMOJI.hearty}${MEAL_CHOICE_LABELS.hearty}（${shortDate(date)} ${SLOT_LABELS[slot]}）`
}

// 見出し・トーストに出すチートの名前
export function getGaugeCheatName(entry: GaugeCheatEntry): string {
  if (entry.mode === 'hearty') return heartyCheatLabel(entry.date, entry.slot)
  return entry.row.label || WANT_KIND_LABELS[entry.row.kind]
}

// ゲージに乗せる絵文字：アイテム表のジャンルの絵文字（がっつりは🔥、中身なしは kind の絵文字）
export function getGaugeCheatEmoji(entry: GaugeCheatEntry): string {
  if (entry.mode === 'hearty') return MEAL_CHOICE_EMOJI.hearty
  const genre = entry.row.items?.[0]?.genre
  return (genre && genreDef(genre)?.emoji) || WANT_KIND_EMOJI[entry.row.kind]
}

// 0kcal化の並び順：日付のあるもの（日付指定・がっつり）は日付の早い順（同じ日は朝・昼・夜、さらに登録順）、
// 日付のないもの（頻度ベース）はその後ろに登録順
export function orderZeroCalCheats(entries: GaugeCheatEntry[]): GaugeCheatEntry[] {
  const slotIndex = (e: GaugeCheatEntry) =>
    SLOT_ORDER.indexOf(e.mode === 'hearty' ? e.slot : (e.row.replace_slot ?? 'dinner'))
  const createdAt = (e: GaugeCheatEntry) => (e.mode === 'hearty' ? '' : e.row.created_at ?? '')
  const dated = entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => e.mode !== 'frequency')
    .sort((a, b) => {
      const da = (a.e as Exclude<GaugeCheatEntry, { mode: 'frequency' }>).date
      const db = (b.e as Exclude<GaugeCheatEntry, { mode: 'frequency' }>).date
      return (
        da.localeCompare(db) ||
        slotIndex(a.e) - slotIndex(b.e) ||
        createdAt(a.e).localeCompare(createdAt(b.e)) ||
        a.index - b.index
      )
    })
    .map(({ e }) => e)
  const undated = entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => e.mode === 'frequency')
    .sort((a, b) => createdAt(a.e).localeCompare(createdAt(b.e)) || a.index - b.index)
    .map(({ e }) => e)
  return [...dated, ...undated]
}

// 並べたチートを累計し、累計コスト ≦ 貯まったpt のものを0kcal化済みにする
export function calcZeroCalStatus(ordered: GaugeCheatEntry[], earnedPt: number): ZeroCalStatus {
  const earned = Math.max(0, earnedPt)
  let cumulative = 0
  const entries: ZeroCalEntry[] = ordered.map((entry) => {
    cumulative += entry.costPt
    return { entry, cumulativePt: cumulative, zeroed: cumulative <= earned }
  })
  const totalPt = cumulative
  const nextEntry = entries.find((e) => !e.zeroed) ?? null
  const remainingPt = nextEntry ? nextEntry.cumulativePt - earned : 0
  return {
    entries,
    totalPt,
    earnedPt: earned,
    zeroedPt: Math.min(earned, totalPt),
    zeroedCount: entries.filter((e) => e.zeroed).length,
    next: nextEntry
      ? { entry: nextEntry.entry, remainingPt, tamemeshiNeeded: Math.ceil(remainingPt / TAMEMESHI_PT) }
      : null,
    extraPt: nextEntry ? 0 : earned - totalPt,
    scalePt: Math.max(totalPt, earned),
  }
}

// 記録の前後の貯まったptを比べて、新たに0kcal化済みになったチート（複数なら最後の1件）。無ければ null
export function detectNewlyZeroed(
  ordered: GaugeCheatEntry[],
  beforePt: number,
  afterPt: number
): GaugeCheatEntry | null {
  const before = new Set(calcZeroCalStatus(ordered, beforePt).entries.filter((e) => e.zeroed).map((e) => e.entry))
  const added = calcZeroCalStatus(ordered, afterPt).entries.filter((e) => e.zeroed && !before.has(e.entry))
  return added.length > 0 ? added[added.length - 1].entry : null
}

// 見出し（13.3）
export function describeZeroCalHeadline(status: ZeroCalStatus): string {
  if (status.entries.length === 0) return '食べたいものを先に決めよう'
  const zeroed = status.entries.filter((e) => e.zeroed).map((e) => getGaugeCheatName(e.entry))
  if (zeroed.length === 0) return `最初のチートまで、あと${MEAL_CHOICE_LABELS.light}${status.next?.tamemeshiNeeded ?? 0}回`
  const names =
    zeroed.length > ZERO_CAL_HEADLINE_MAX
      ? `${zeroed.slice(0, ZERO_CAL_HEADLINE_MAX).join('・')}ほか${zeroed.length - ZERO_CAL_HEADLINE_MAX}件`
      : zeroed.join('・')
  return `${names}、実質0kcalで ごちそうさまでした`
}

// ゲージのアイコン。位置 = 累計コスト ÷ 目盛りの最大（max(合計, 貯まったpt)。14.2）
// 前のアイコンとの間が minGap 未満なら1つにまとめる（絵文字は最初の1件）
export function buildGaugeMarkers(status: ZeroCalStatus, minGap = GAUGE_MARKER_MIN_GAP): GaugeMarker[] {
  if (status.totalPt <= 0 || status.scalePt <= 0) return []
  const markers: GaugeMarker[] = []
  for (const e of status.entries) {
    const ratio = e.cumulativePt / status.scalePt
    const last = markers[markers.length - 1]
    if (last && ratio - last.ratio < minGap) {
      last.ratio = ratio
      last.count += 1
      last.zeroed = last.zeroed && e.zeroed
      continue
    }
    markers.push({ ratio, emoji: getGaugeCheatEmoji(e.entry), count: 1, zeroed: e.zeroed })
  }
  return markers
}

// --- 14.2. ごほうび（目標を超えて貯めた分。今月限り） ---

export function calcRewardKcal(earnedPt: number, targetPt: number): number {
  return Math.max(0, earnedPt - targetPt)
}

// ごほうび以下でいちばん kcal が大きい候補。150kcal未満、または届く候補がなければ null
export function pickRewardItem(rewardKcal: number, items: RewardItem[] = REWARD_ITEMS): RewardPick | null {
  if (rewardKcal < REWARD_MIN_KCAL) return null
  let best: RewardPick | null = null
  for (const item of items) {
    const kcal = calcMealExampleKcal(item.items)
    if (kcal <= rewardKcal && (!best || kcal > best.kcal)) best = { name: item.name, kcal }
  }
  return best
}

// --- 14.3. ログ ---

// 「≒ ビール◯杯ぶん」：生ビール中ジョッキの kcal で割って切り捨て（1杯未満は0 → 画面では出さない）
export function calcBeerEquivalent(pt: number): number {
  return Math.max(0, Math.floor(pt / FOOD_ITEM_MAP.draft_beer.kcal))
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

// 過去14日分（今日を含む）の一覧。新しい日が上。メシため（light）とうごためだけ。記録がない日は出さない
export function buildLogDays(input: {
  today: string
  mealLogs: MealLogRow[]
  exerciseLogs: ExerciseLogRow[]
  filter: LogFilter
  replacedMealKeys?: Set<string>
}): LogDay[] {
  const { today, mealLogs, exerciseLogs, filter, replacedMealKeys } = input
  const from = addDaysToDateStr(today, -(LOG_DAYS - 1))
  const days: LogDay[] = []
  for (let d = today; d >= from; d = addDaysToDateStr(d, -1)) {
    const meals: LogEntry[] =
      filter === 'exercise'
        ? []
        : mealLogs
            .filter((l) => l.log_date === d && l.choice === 'light')
            .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
            .map((log) => ({
              kind: 'meal',
              log,
              pt: replacedMealKeys?.has(`${log.log_date}:${log.slot}`) ? 0 : TAMEMESHI_PT,
            }))
    const exercises: LogEntry[] =
      filter === 'meal'
        ? []
        : exerciseLogs
            .filter((l) => l.log_date === d)
            .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
            .map((log) => ({ kind: 'exercise', log, pt: log.points }))
    const entries = [...meals, ...exercises]
    if (entries.length > 0) days.push({ date: d, entries })
  }
  return days
}

// --- 14.4. 体重チャート：チートの累計（棒）＋体重（線） ---

// 食べたチート：日付のある登録チートとがっつりを、その日付に。今日より先は数えない
export function buildCheatEvents(input: {
  wants: MonthlyWantRow[]
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
  from: string
  today: string
}): CheatEvent[] {
  const { wants, mealLogs, slotTargets, from, today } = input
  const active = wants.filter((r) => r.is_active !== false)
  const dated: CheatEvent[] = active
    .filter((r) => r.scheduled_date != null && r.scheduled_date >= from && r.scheduled_date <= today)
    .map((row) => {
      const entry: GaugeCheatEntry = {
        mode: 'dated',
        row,
        date: row.scheduled_date as string,
        costPt: getMonthlyWantRowCost(row, slotTargets),
        done: true,
      }
      return { date: entry.date, costPt: entry.costPt, emoji: getGaugeCheatEmoji(entry), name: getGaugeCheatName(entry) }
    })
  const hearty: CheatEvent[] = expandHeartyCheats(mealLogs, from, today, getReplacedMealKeys(active)).map((e) => ({
    date: e.date,
    costPt: e.costPt,
    emoji: getGaugeCheatEmoji(e),
    name: getGaugeCheatName(e),
  }))
  return [...dated, ...hearty].sort((a, b) => a.date.localeCompare(b.date))
}

// 週◯回のチート（見出しの累計にだけ入れる）。登録した月から今月まで
// 過去の月は月の回数をまるごと、今月は「月の回数 × 今日までの日数 ÷ 月の日数」の切り捨て
export function calcFrequencyCheatKcal(input: {
  wants: MonthlyWantRow[]
  slotTargets: Pick<MealSlotTarget, 'slot' | 'kcal'>[]
  from: string
  today: string
}): number {
  const { wants, slotTargets, from, today } = input
  const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
  const todayIndex = monthIndex(today)
  const dayOfMonth = Number(today.slice(8, 10))
  let total = 0
  for (const row of wants) {
    if (row.is_active === false || row.scheduled_date != null || (row.times_per_week ?? 0) <= 0) continue
    const cost = getMonthlyWantRowCost(row, slotTargets)
    const created = row.created_at ? formatDateJST(new Date(row.created_at)) : from
    const start = Math.max(monthIndex(from), monthIndex(created))
    for (let i = start; i <= todayIndex; i++) {
      const year = Math.floor(i / 12)
      const month = (i % 12) + 1
      const times = countFrequencyInMonth(row.times_per_week as number, year, month)
      const counted = i === todayIndex ? Math.floor((times * dayOfMonth) / getDaysInMonth(year, month)) : times
      total += counted * cost
    }
  }
  return total
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
    totalKcal: cumulative + calcFrequencyCheatKcal({ wants, slotTargets, from, today }),
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

// 表示する範囲。1ヶ月・3ヶ月は今日までの直近（開始直後は開始日から）。全期間は開始日〜計画の終わり
export function getChartRange(
  period: ChartPeriod,
  today: string,
  plan: Pick<GoalPlanRow, 'start_date' | 'period_months'>
): { from: string; to: string } {
  if (period === 'all') {
    const end = getPlanMonthEndDate(plan.start_date, plan.period_months)
    return { from: plan.start_date, to: today > end ? today : end }
  }
  const days = CHART_PERIOD_DAYS[period]
  const recent = addDaysToDateStr(today, -(days - 1))
  const from = recent > plan.start_date ? recent : plan.start_date
  return { from, to: addDaysToDateStr(from, days - 1) > today ? addDaysToDateStr(from, days - 1) : today }
}

export function buildWeightChartData(
  logs: Pick<WeightLog, 'measured_at' | 'weight_kg'>[],
  plan: Pick<GoalPlanRow, 'start_date' | 'start_weight_kg' | 'gates' | 'period_months'>,
  period: ChartPeriod,
  today: string
): WeightChartData {
  const { from, to } = getChartRange(period, today, plan)
  const days = daysBetween(from, to) + 1

  const dailyPoints = logs
    .filter((l) => l.measured_at >= from && l.measured_at <= to)
    .map((l) => ({ date: l.measured_at, kg: Number(l.weight_kg) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 7日平均は今日まで。7日間に記録が無い日で線を切る
  const averageSegments: WeightChartPoint[][] = []
  let segment: WeightChartPoint[] = []
  const avgTo = to < today ? to : today
  for (let d = from; d <= avgTo; d = addDaysToDateStr(d, 1)) {
    const { avgKg } = calcWeightAverage(logs, d)
    if (avgKg === null) {
      if (segment.length) averageSegments.push(segment)
      segment = []
    } else {
      segment.push({ date: d, kg: avgKg })
    }
  }
  if (segment.length) averageSegments.push(segment)

  const fullLine = buildTargetLine(plan)
  const targetLine: WeightChartPoint[] = [
    { date: from, kg: getTargetWeightOn(fullLine, from) },
    ...fullLine.filter((p) => p.date > from && p.date < to).map(({ date, kg }) => ({ date, kg })),
    { date: to, kg: getTargetWeightOn(fullLine, to) },
  ]
  const gateMarkers = fullLine
    .filter((p): p is TargetLinePoint & { gateIndex: number } => p.gateIndex !== null && p.date >= from && p.date <= to)
    .map((p) => ({ date: p.date, gateIndex: p.gateIndex }))

  const values = [...dailyPoints, ...averageSegments.flat(), ...targetLine].map((p) => p.kg)
  const yMin = Math.floor((Math.min(...values) - CHART_Y_PADDING_KG) * 2) / 2
  const yMax = Math.ceil((Math.max(...values) + CHART_Y_PADDING_KG) * 2) / 2

  return { from, to, days, dailyPoints, averageSegments, targetLine, gateMarkers, yMin, yMax }
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
      found.push({ kind, title: `ゲート${g.index}達成！`, message: `開始から ${lossKg.toFixed(1)}kg 減った。この調子でいこう` })
    }
  }
  for (const h of HEALTH_MILESTONES) {
    if (!achieved.has(h.kind) && lossKg >= startKg * h.ratio - EPSILON) {
      found.push({ kind: h.kind, title: `開始から${Math.round(h.ratio * 100)}%減`, message: h.message })
    }
  }
  return found
}
