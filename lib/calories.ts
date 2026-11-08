import {
  PlanBlock,
  DayBlocks,
  MEAL_TYPES,
  EXERCISE_TYPES,
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
  WANT_COSTS,
  EXERCISE_POINTS,
  MEAL_RECORD_DELTA,
  EXERCISE_PT_PER_MIN,
  PT_PER_1000_STEPS,
  RECORD_PAST_DAYS,
} from '@/lib/calorieConstants'
import { CHEAT_GENRE_MAP, type CheatGenre, type CheatItem } from '@/lib/cheatItems'
import { MEAL_EXAMPLES, MEAL_EXAMPLE_RANGE, MEAL_EXAMPLES_MAX, type MealExample } from '@/lib/mealExamples'

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

// 朝・昼・夜の目安kcal（毎日共通）。合計は「1日の目安 − 欲望用150」
export interface MealSlotTarget {
  slot: MealSlot
  label: string
  kcal: number
}

const SLOT_RATIOS: [number, number, number] = [0.25, 0.35, 0.4]

const SLOT_LABELS: Record<MealSlot, string> = {
  morning: '朝',
  lunch: '昼',
  dinner: '夜',
}

export function calcMealSlotTargets(dailyIntakeKcal: number): MealSlotTarget[] {
  const totalKcal = Math.max(0, dailyIntakeKcal - WANT_BUFFER_PER_DAY)
  const slots: MealSlot[] = ['morning', 'lunch', 'dinner']
  let allocated = 0
  return slots.map((slot, i) => {
    const kcal =
      i === slots.length - 1 ? totalKcal - allocated : Math.round(totalKcal * SLOT_RATIOS[i])
    allocated += kcal
    return { slot, label: SLOT_LABELS[slot], kcal }
  })
}

// --- 10-2. 目安くらいの例・がっつりの例 ---

export interface MealExamples {
  normal: MealExample[] // 目安 ±15%
  hearty: MealExample[] // 目安 + 300 以上
  heartyMinKcal: number
}

// 近い順に並べ、同じジャンルは先に2件までにして和・洋・外食・コンビニを混ぜる。表示は近い順
function pickMixed(candidates: MealExample[], distance: (m: MealExample) => number): MealExample[] {
  const sorted = [...candidates].sort((a, b) => distance(a) - distance(b))
  const picked: MealExample[] = []
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
  const forSlot = menu.filter((m) => m.slots.includes(slot))
  const range = targetKcal * MEAL_EXAMPLE_RANGE
  const heartyMin = targetKcal + MEAL_RECORD_DELTA.hearty

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

// 「このチートは ◯pt ＝ 軽め◯回 or ウォーキング◯分」
export function convertCheatCost(costPt: number): { lightMeals: number; walkingMinutes: number } {
  const pt = Math.max(0, costPt)
  return {
    lightMeals: Math.ceil(pt / LIGHT_MEAL_KCAL),
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

// --- 10-4. メシポゲージは「月で1本」 ---

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

// 今日までに貯まったpt（どの日の分も同じ月のプールに入る）
// = 経過日数 × 150 + 記録の3択（軽め +150 / がっつり −300）+ 運動のpt
// 経過日数は今日を含む。置き換えたチートがある食事の記録は数えない（コストが二重に引かれないように）
export function calcMonthEarnedPt(input: {
  year: number
  month: number
  today: string // YYYY-MM-DD（日本時間）
  mealLogs: { log_date: string; slot: MealSlot; choice: MealChoice }[]
  exerciseLogs: { log_date: string; points: number }[]
  replacedMealKeys?: Set<string>
}): number {
  const { year, month, today, mealLogs, exerciseLogs, replacedMealKeys } = input
  const prefix = monthPrefix(year, month)
  const inMonth = (d: string) => d.startsWith(prefix) && d <= today
  const elapsedDays = today.startsWith(prefix) ? Number(today.slice(8, 10)) : today > prefix ? getDaysInMonth(year, month) : 0

  const mealPt = mealLogs
    .filter((l) => inMonth(l.log_date) && !replacedMealKeys?.has(`${l.log_date}:${l.slot}`))
    .reduce((sum, l) => sum - MEAL_RECORD_DELTA[l.choice], 0)
  const exercisePt = exerciseLogs.filter((l) => inMonth(l.log_date)).reduce((sum, l) => sum + l.points, 0)

  return elapsedDays * WANT_BUFFER_PER_DAY + mealPt + exercisePt
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
  const projectedPt = earnedPt + (daysInMonth - dayOfMonth) * WANT_BUFFER_PER_DAY
  return {
    targetPt,
    earnedPt,
    pacePt,
    onPace: behindPt === 0,
    behindPt,
    catchUpWalkingMinutes: Math.ceil(behindPt / EXERCISE_PT_PER_MIN.walking),
    extraPt: Math.max(0, earnedPt - targetPt),
    projectedPt,
    lightMealsNeeded: Math.max(0, Math.ceil((targetPt - projectedPt) / LIGHT_MEAL_KCAL)),
    fillRatio: targetPt > 0 ? Math.min(1, Math.max(0, earnedPt / targetPt)) : 1,
    paceRatio: Math.min(1, dayOfMonth / daysInMonth),
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
