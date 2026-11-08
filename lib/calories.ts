import {
  PlanBlock,
  DayBlocks,
  MEAL_TYPES,
  EXERCISE_TYPES,
  LossLimitCheck,
  Gate,
  GatePlan,
  DailySavingResult,
  WeeklyBudget,
  WantEntry,
  LightMealResult,
  WantGauge,
  WantGaugeResult,
  RecoveryOption,
  GoalPlanRow,
  CurrentMonthTargets,
  MonthlyWantRow,
  MealChoice,
  MealSlot,
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
  WANT_BUFFER_PER_DAY,
  LIGHT_MEAL_KCAL,
  MAX_LIGHT_MEALS_PER_WEEK,
  WANT_COSTS,
  EXERCISE_POINTS,
  MEAL_RECORD_DELTA,
} from '@/lib/calorieConstants'

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

// 日別ブロックをグループ化
export function groupBlocksByDay(blocks: PlanBlock[]): DayBlocks[] {
  const dayMap = new Map<string, DayBlocks>()

  for (const block of blocks) {
    if (!dayMap.has(block.plan_date)) {
      dayMap.set(block.plan_date, {
        date: block.plan_date,
        meal_morning: [],
        meal_lunch: [],
        meal_snack: [],
        meal_dinner: [],
        meal_drinks: [],
        exercise_weights: [],
        exercise_cardio: [],
        exercise_sport: [],
        totalCaloriesIn: 0,
        totalCaloriesBurned: 0,
        netCalories: 0,
      })
    }
    const day = dayMap.get(block.plan_date)!
    day[block.block_type].push(block)

    if (MEAL_TYPES.includes(block.block_type as any)) {
      day.totalCaloriesIn += block.calories || 0
    } else if (EXERCISE_TYPES.includes(block.block_type as any)) {
      day.totalCaloriesBurned += block.calories || 0
    }
    day.netCalories = day.totalCaloriesIn - day.totalCaloriesBurned
  }

  return Array.from(dayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )
}

// ビール換算（200kcal = ビール1本）
export function toBeerCount(calories: number): number {
  return Math.floor(calories / 200)
}

// ラーメン換算（800kcal = ラーメン1杯）
export function toRamenCount(calories: number): number {
  return Math.floor(calories / 800)
}

// 週の月曜日を返す
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
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

export function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return formatDate(d)
  })
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']
export function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]
}

// ===== v2 計算ロジック（docs/v2-spec.md 6章）=====
// すべて決定的な純粋関数。月は 1〜12 で受け取る

const MS_PER_DAY = 24 * 60 * 60 * 1000
const EPSILON = 1e-9

// a から b までの日数（同じ日なら0）
function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / MS_PER_DAY)
}

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
// 上限 = min(750, TDEE − 基礎代謝 − 欲望用150)。目安パターンの合計が基礎代謝を下回らないようにする
export function calcDailySaving(
  monthlyTargetKg: number,
  year: number,
  month: number,
  tdee: number,
  bmr: number
): DailySavingResult {
  const uncappedKcal = Math.round((monthlyTargetKg * KCAL_PER_KG) / getDaysInMonth(year, month))
  const capKcal = Math.max(0, Math.min(MAX_DAILY_SAVING_KCAL, tdee - bmr - WANT_BUFFER_PER_DAY))
  const savingKcal = Math.min(uncappedKcal, capKcal)
  return { savingKcal, uncappedKcal, capKcal, capped: uncappedKcal > capKcal }
}

// 1日の目安カロリー = TDEE − 1日の貯金（基礎代謝は下回らない）
export function calcDailyIntakeTarget(tdee: number, dailySavingKcal: number, bmr: number): number {
  return Math.max(tdee - dailySavingKcal, bmr)
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
export function calcCurrentMonthTargets(
  plan: Pick<GoalPlanRow, 'start_date' | 'period_months' | 'gates' | 'tdee' | 'bmr'>,
  date: Date
): CurrentMonthTargets {
  const [startYear, startMonth] = plan.start_date.split('-').map(Number)
  const [year, month] = formatDateJST(date).split('-').map(Number)
  const monthNumber = Math.max(1, (year - startYear) * 12 + (month - startMonth) + 1)
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

// --- 6. 週の計算 ---

// その週（月曜始まり）のうち、指定月に含まれる日数
function countWeekDaysInMonth(weekStart: Date, year: number, month: number): number {
  let count = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    if (d.getFullYear() === year && d.getMonth() + 1 === month) count++
  }
  return count
}

// 週の欲望貯金 = 150 × その週の日数。month を渡すと、その月に含まれる日数で按分する
export function calcWeeklyWantSaving(
  date: Date,
  month?: { year: number; month: number }
): number {
  const weekStart = getWeekStart(date)
  const days = month ? countWeekDaysInMonth(weekStart, month.year, month.month) : 7
  return WANT_BUFFER_PER_DAY * days
}

// 週の予算 = 月の残り予算 ÷ 残りの週数
// 残りの週数は「この週の初日（月初より前なら月初）から月末までの日数 ÷ 7」。月をまたぐ週は日数で按分される
export function calcWeeklyBudget(
  monthRemainingKcal: number,
  date: Date,
  year: number,
  month: number
): WeeklyBudget {
  const weekStart = getWeekStart(date)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month - 1, getDaysInMonth(year, month))
  const from = weekStart > monthStart ? weekStart : monthStart

  const daysInMonthThisWeek = countWeekDaysInMonth(weekStart, year, month)
  const remainingDays = Math.max(0, daysBetween(from, monthEnd) + 1)
  if (daysInMonthThisWeek === 0 || remainingDays === 0) {
    return { budgetKcal: 0, daysInMonthThisWeek: 0, remainingDays, remainingWeeks: remainingDays / 7 }
  }

  return {
    budgetKcal: Math.round((monthRemainingKcal * daysInMonthThisWeek) / remainingDays),
    daysInMonthThisWeek,
    remainingDays,
    remainingWeeks: remainingDays / 7,
  }
}

// --- 6-4. 貯金ゲージ・軽め回数・マイナス時 ---

export function getWantCost(want: WantEntry): number {
  return want.costKcal ?? WANT_COSTS[want.kind]
}

export function sumWantCosts(wants: WantEntry[]): number {
  return wants.reduce((sum, w) => sum + getWantCost(w), 0)
}

// 軽めの回数 = 切り上げ((欲望コスト − 週の貯金 − 運動ポイント) ÷ 150)
export function calcLightMealCount(
  wantCostKcal: number,
  weekSavingKcal: number,
  exercisePoints: number = 0
): LightMealResult {
  const shortfallKcal = Math.max(0, wantCostKcal - weekSavingKcal - exercisePoints)
  const count = Math.ceil(shortfallKcal / LIGHT_MEAL_KCAL)
  return { shortfallKcal, count, exceedsWeeklyMax: count > MAX_LIGHT_MEALS_PER_WEEK }
}

// 日付指定の欲望を日付順、その後ろに頻度型（date: null）を登録順で並べる
function sortWants(wants: WantEntry[]): WantEntry[] {
  const dated = wants
    .filter((w) => w.date !== null)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))
  const undated = wants.filter((w) => w.date === null)
  return [...dated, ...undated]
}

// 欲望ごとの貯金ゲージ
// 1. 週の欲望貯金を順に充て、埋まらなかった分を各ゲージの満タン値にする
// 2. 軽め・運動で貯めた分（＋前週の持ち越し）を順にゲージへ入れる。余りはボーナスとして持ち越す
export function calcWantGauges(
  wants: WantEntry[],
  weekSavingKcal: number,
  earnedKcal: number,
  carryOverKcal: number = 0
): WantGaugeResult {
  let saving = weekSavingKcal
  let earned = earnedKcal + carryOverKcal

  const gauges: WantGauge[] = sortWants(wants).map((want) => {
    const costKcal = getWantCost(want)
    const covered = Math.min(costKcal, Math.max(0, saving))
    saving -= covered
    const targetKcal = costKcal - covered

    const currentKcal = Math.min(targetKcal, Math.max(0, earned))
    earned -= currentKcal

    return {
      want,
      costKcal,
      targetKcal,
      currentKcal,
      achieved: currentKcal >= targetKcal,
      remainingLightMeals: Math.ceil((targetKcal - currentKcal) / LIGHT_MEAL_KCAL),
    }
  })

  return { gauges, bonusKcal: Math.max(0, earned) }
}

// マイナス時の解消方法（ユーザーが選ぶ。欲望の予定は自動で動かさない）
export function calcRecoveryOptions(deficitKcal: number, wants: WantEntry[]): RecoveryOption[] {
  if (deficitKcal <= 0) return []

  const walkCount = Math.ceil(deficitKcal / EXERCISE_POINTS.walking_30min)
  const lightCount = Math.ceil(deficitKcal / LIGHT_MEAL_KCAL)

  return [
    {
      type: 'exercise',
      exercise: 'walking_30min',
      count: walkCount,
      points: walkCount * EXERCISE_POINTS.walking_30min,
    },
    { type: 'light_meals', count: lightCount, points: lightCount * LIGHT_MEAL_KCAL },
    ...sortWants(wants).map(
      (w): RecoveryOption => ({ type: 'swap_want', wantId: w.id, kind: w.kind, points: getWantCost(w) })
    ),
  ]
}

// --- 欲望の月登録 → その週の WantEntry[] ---

// 日付指定はその週に落ちるもの、頻度型は times_per_week 回ぶん（date: null）を並べる
export function expandMonthlyWantsForWeek(
  rows: Pick<MonthlyWantRow, 'id' | 'kind' | 'scheduled_date' | 'times_per_week' | 'label' | 'is_active'>[],
  weekStart: Date
): WantEntry[] {
  // 日付比較は日本時間の YYYY-MM-DD で揃える（formatDate は UTC なので使わない）
  const weekDates = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return formatDateJST(d)
    })
  )
  const entries: WantEntry[] = []

  for (const row of rows) {
    if (row.is_active === false) continue

    if (row.scheduled_date) {
      if (!weekDates.has(row.scheduled_date)) continue
      entries.push({
        id: row.id,
        kind: row.kind,
        date: row.scheduled_date,
        label: row.label ?? undefined,
      })
      continue
    }

    const times = row.times_per_week ?? 0
    for (let i = 0; i < times; i++) {
      entries.push({
        id: `${row.id}#${i + 1}`,
        kind: row.kind,
        date: null,
        label: row.label ?? undefined,
      })
    }
  }

  return entries
}

// その月の日付指定欲望（カレンダー表示用）
export function filterDatedWantsInMonth(
  rows: Pick<MonthlyWantRow, 'scheduled_date' | 'is_active'>[],
  year: number,
  month: number
): typeof rows {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return rows.filter(
    (r) => r.is_active !== false && r.scheduled_date != null && r.scheduled_date.startsWith(prefix)
  )
}

// 食事記録の差分合計（軽め・がっつり）
export function sumMealLogDelta(
  logs: { choice: MealChoice }[]
): number {
  return logs.reduce((sum, log) => sum + MEAL_RECORD_DELTA[log.choice], 0)
}

// 今週すでに「控えめ」にした回数（軽め消化）
export function countLightMealLogs(
  logs: { choice: MealChoice }[]
): number {
  return logs.filter((l) => l.choice === 'light').length
}

// 目安パターン（和/洋）。合計は「1日の目安 − 欲望用150」
export type MealPatternStyle = 'washoku' | 'yoshoku'

export interface MealPatternSlot {
  slot: MealSlot
  label: string
  items: string
  kcal: number
}

export interface MealPattern {
  style: MealPatternStyle
  styleLabel: string
  slots: MealPatternSlot[]
  totalKcal: number
}

const PATTERN_TEMPLATES: Record<
  MealPatternStyle,
  { styleLabel: string; ratios: [number, number, number]; items: [string, string, string] }
> = {
  washoku: {
    styleLabel: '和',
    ratios: [0.25, 0.35, 0.4],
    items: [
      'ご飯一膳、卵、味噌汁、小鉢',
      '定食（主菜・ご飯・汁物・小鉢）',
      '定食（主菜・ご飯・汁物・野菜）',
    ],
  },
  yoshoku: {
    styleLabel: '洋',
    ratios: [0.25, 0.35, 0.4],
    items: [
      'トースト、卵、ヨーグルト',
      'プレート（主菜・サラダ・パン）',
      'プレート（主菜・サラダ・スープ）',
    ],
  },
}

const SLOT_LABELS: Record<MealSlot, string> = {
  morning: '朝',
  lunch: '昼',
  dinner: '夜',
}

export function buildMealPatterns(dailyIntakeKcal: number): MealPattern[] {
  const totalKcal = Math.max(0, dailyIntakeKcal - WANT_BUFFER_PER_DAY)
  const slots: MealSlot[] = ['morning', 'lunch', 'dinner']

  return (Object.keys(PATTERN_TEMPLATES) as MealPatternStyle[]).map((style) => {
    const tpl = PATTERN_TEMPLATES[style]
    let allocated = 0
    const patternSlots: MealPatternSlot[] = slots.map((slot, i) => {
      const kcal =
        i === slots.length - 1
          ? totalKcal - allocated
          : Math.round(totalKcal * tpl.ratios[i])
      allocated += kcal
      return {
        slot,
        label: SLOT_LABELS[slot],
        items: tpl.items[i],
        kcal,
      }
    })
    return { style, styleLabel: tpl.styleLabel, slots: patternSlots, totalKcal }
  })
}

