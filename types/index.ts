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
  initial_buffer: number
  target_buffer: number
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

// ===== v2 計算ロジック（docs/v2-spec.md 6章） =====

// 減量上限チェックの結果
export interface LossLimitCheck {
  bmi: number
  standardWeightKg: number // BMI22の体重（参考表示）
  annualLimitRate: number // 年の上限率
  limitKg: number // 期間で按分した上限kg
  targetLossKg: number
  periodMonths: number
  withinLimit: boolean
  suggestedPeriodMonths: number | null // 上限を超える場合の提案期間（3ヶ月単位）
}

export interface Gate {
  index: number // 1始まり
  ratio: number
  lossKg: number // このゲートで落とすkg
  targetWeightKg: number // ゲート終了時の目標体重
  endMonth: number // 開始から何ヶ月目で終わるか
}

export interface GatePlan {
  gates: Gate[]
  gate1MinKg: number // ゲート1の最低ライン（現体重の3%）
  gate1MeetsMinimum: boolean
}

export interface DailySavingResult {
  savingKcal: number // 実際に使う1日の貯金
  uncappedKcal: number // 上限をかける前の値
  capKcal: number // min(750, TDEE − 基礎代謝 − 150)
  capped: boolean
}

export type WantKind = 'ramen' | 'drinking_party' | 'evening_drink' | 'other'

export const WANT_KIND_LABELS: Record<WantKind, string> = {
  ramen: 'ラーメン',
  drinking_party: '飲み会',
  evening_drink: '晩酌',
  other: 'チート',
}

export const WANT_KIND_EMOJI: Record<WantKind, string> = {
  ramen: '🍜',
  drinking_party: '🍻',
  evening_drink: '🍺',
  other: '★',
}

// monthly_wants テーブルの1行
export interface MonthlyWantRow {
  id: string
  user_id: string
  kind: WantKind
  scheduled_date: string | null // YYYY-MM-DD（日付指定）
  times_per_week: number | null // 頻度ベース
  label: string | null
  is_active: boolean
  created_at: string
  // v2.1：中身を選んだチート（null は中身なし → WANT_COSTS をデフォルトに使う）
  cheat_type: CheatType | null
  replace_slot: MealSlot | null // 置き換えのとき、どの食事の代わりか
  items: CheatItemSelection[] | null
  total_kcal: number | null
}

// 置き換え（食事の代わり）/ 上乗せ（食事に追加）
export type CheatType = 'replace' | 'addon'

// チート1回分の中身（登録時の kcal をそのまま保存する）
export interface CheatItemSelection {
  genre: string // lib/cheatItems.ts の CheatGenre
  name: string
  kcal: number
  qty: number
}

// custom_cheat_items テーブルの1行（自由入力したアイテム）
export interface CustomCheatItemRow {
  id: string
  user_id: string
  genre: string
  name: string
  kcal: number
  created_at: string
}

export type MealSlot = 'morning' | 'lunch' | 'dinner'
export type MealChoice = 'light' | 'normal' | 'hearty'

export interface MealLogRow {
  id: string
  user_id: string
  log_date: string
  slot: MealSlot
  choice: MealChoice
  created_at: string
}

// その週の欲望1件（頻度型は回数分を date: null で並べる）
export interface WantEntry {
  id: string
  kind: WantKind
  date: string | null // YYYY-MM-DD
  costKcal?: number // 固定値テーブル以外のコストを使う場合
  label?: string
}

export type RecoveryOption =
  | { type: 'exercise'; exercise: 'walking_30min'; count: number; points: number }
  | { type: 'light_meals'; count: number; points: number }
  | { type: 'swap_want'; wantId: string; kind: WantKind; points: number }

// goal_plans テーブルの1行（入力値と目標の骨組み。1日の貯金・目安は gates から毎回計算する）
export interface GoalPlanRow {
  id: string
  user_id: string
  start_date: string // YYYY-MM-DD
  period_months: number
  height_cm: number
  start_weight_kg: number
  target_weight_kg: number
  age: number
  sex: 'male' | 'female' | 'other'
  activity_level: 'low' | 'moderate' | 'high'
  bmr: number
  tdee: number
  target_loss_kg: number
  gates: Gate[]
  is_active: boolean
  created_at: string
}

// calcCurrentMonthTargets の結果
export interface CurrentMonthTargets {
  year: number
  month: number // 1〜12（日本時間）
  monthNumber: number // 開始月を1とした何ヶ月目か
  gateIndex: number | null // 該当ゲート（期間外は null）
  finished: boolean // 期間を過ぎている
  monthlyTargetKg: number
  dailySaving: DailySavingResult
  dailyIntakeKcal: number
}

// ===== v2.1 メシポゲージ（月で1本）・運動 =====

export type ExerciseType = 'walking' | 'running' | 'weights' | 'cycling' | 'sports' | 'steps'

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  walking: 'ウォーキング',
  running: 'ランニング',
  weights: '筋トレ',
  cycling: '自転車',
  sports: 'スポーツ',
  steps: '歩数',
}

export const EXERCISE_TYPE_EMOJI: Record<ExerciseType, string> = {
  walking: '🚶',
  running: '🏃',
  weights: '💪',
  cycling: '🚴',
  sports: '⚽',
  steps: '👟',
}

// exercise_logs テーブルの1行
export interface ExerciseLogRow {
  id: string
  user_id: string
  log_date: string // YYYY-MM-DD（日本時間）
  exercise_type: ExerciseType
  minutes: number | null
  steps: number | null
  points: number
  created_at: string
}

// その月のチート1件（頻度ベースはその月に入る回数をまとめて1件）
export type MonthCheatEntry =
  | { mode: 'dated'; row: MonthlyWantRow; date: string; costPt: number; done: boolean }
  | {
      mode: 'frequency'
      row: MonthlyWantRow
      timesPerWeek: number
      timesInMonth: number
      costPerTimePt: number
      costPt: number // costPerTimePt × timesInMonth
    }

export interface MeshipoGauge {
  targetPt: number // その月のチートのコスト合計
  earnedPt: number // 今日までに貯まったpt
  pacePt: number // 今日までに貯まっていたい量 = 目標 × 経過日数 ÷ 月の日数
  onPace: boolean
  behindPt: number // ペースに追いつくまであと◯pt
  catchUpWalkingMinutes: number // 今日◯分歩くとペースに追いつく
  extraPt: number // 目標を超えた分（追加でチートできる量）
  projectedPt: number // 見込み = 貯まったpt + 残り日数 × 150
  lightMealsNeeded: number // 今月あと必要な軽め（0なら軽めなしでOK）
  fillRatio: number // ゲージの塗り（0〜1）
  paceRatio: number // ペースの目印の位置（0〜1）
}
