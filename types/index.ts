export type BlockType =
  | 'meal_morning'
  | 'meal_lunch'
  | 'meal_snack'
  | 'meal_dinner'
  | 'meal_drinks'
  | 'exercise_weights'
  | 'exercise_cardio'
  | 'exercise_sport'

export type BlockStatus = 'planned' | 'done' | 'skipped' | 'modified'

export type DeviationType =
  | 'ate_more'
  | 'ate_less'
  | 'skipped_exercise'
  | 'extra_exercise'
  | 'extra_snack'
  | 'unplanned_meal'

export interface UserProfile {
  id: string
  display_name: string
  height_cm: number
  weight_kg: number
  target_weight_kg: number
  age: number
  sex: 'male' | 'female' | 'other'
  activity_level: 'low' | 'moderate' | 'high'
  base_calories: number
}

export interface WeekPlan {
  id: string
  user_id: string
  week_start: string
  week_end: string
  status: 'draft' | 'active' | 'completed'
  ai_summary: string
  total_want_calories: number
  total_healthy_calories: number
  total_exercise_calories: number
}

export interface WantItem {
  name: string
  count: number
  calories: number
  drinks?: number // 飲み会の場合の杯数
  emoji?: string
}

export interface WeeklyIntention {
  id: string
  week_plan_id: string
  want_items: WantItem[]
  daily_drinks: boolean
  daily_drinks_count: number
  daily_drinks_calories: number
  allow_snacks: boolean
  snack_calories_per_day: number
  schedule_notes: string
}

export interface PlanBlock {
  id: string
  week_plan_id: string
  user_id: string
  plan_date: string
  block_type: BlockType
  name: string
  calories: number
  duration_min?: number
  is_want: boolean
  is_ai_generated: boolean
  is_flexible: boolean
  sort_order: number
  status: BlockStatus
  actual_name?: string
  actual_calories?: number
  note?: string
}

export interface BlockTemplate {
  id: string
  user_id?: string
  block_type: BlockType
  name: string
  calories: number
  duration_min?: number
  is_want: boolean
  emoji: string
  metadata?: {
    category?: string
    description?: string
  }
}

export interface Deviation {
  id: string
  week_plan_id: string
  plan_block_id?: string
  deviation_date: string
  deviation_type: DeviationType
  description?: string
  calorie_delta: number
  replan_done: boolean
}

export interface WeightLog {
  id: string
  user_id: string
  weight_kg: number
  waist_cm?: number
  note?: string
  measured_at: string
}

export interface CalorieBuffer {
  id: string
  user_id: string
  week_plan_id: string
  total_buffer: number
  updated_at: string
}

// UI用の日別ブロックグループ
export interface DayBlocks {
  date: string
  meal_morning: PlanBlock[]
  meal_lunch: PlanBlock[]
  meal_snack: PlanBlock[]
  meal_dinner: PlanBlock[]
  meal_drinks: PlanBlock[]
  exercise_weights: PlanBlock[]
  exercise_cardio: PlanBlock[]
  exercise_sport: PlanBlock[]
  totalCaloriesIn: number
  totalCaloriesBurned: number
  netCalories: number
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  meal_morning: '🌅 朝',
  meal_lunch: '🍱 昼',
  meal_snack: '🍫 おやつ',
  meal_dinner: '🍽 夕飯',
  meal_drinks: '🍺 晩酌',
  exercise_weights: '💪 筋トレ',
  exercise_cardio: '🏃 有酸素',
  exercise_sport: '⚽ スポーツ',
}

export const EXERCISE_TYPES: BlockType[] = [
  'exercise_weights',
  'exercise_cardio',
  'exercise_sport',
]

export const MEAL_TYPES: BlockType[] = [
  'meal_morning',
  'meal_lunch',
  'meal_snack',
  'meal_dinner',
  'meal_drinks',
]
