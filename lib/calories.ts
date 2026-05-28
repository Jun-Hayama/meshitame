import { PlanBlock, DayBlocks, MEAL_TYPES, EXERCISE_TYPES } from '@/types'

// 基礎代謝計算（ハリス・ベネディクト式）
export function calcBaseMetabolism(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: 'male' | 'female' | 'other'
): number {
  if (sex === 'male') {
    return Math.round(88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age)
  }
  return Math.round(447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age)
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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
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
