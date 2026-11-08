export interface WeightLog {
  id: string
  user_id: string
  weight_kg: number
  waist_cm?: number
  note?: string
  measured_at: string // YYYY-MM-DD（日本時間）。1人1日1件
  created_at?: string
}

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

// ===== フェーズ2 体重・7日平均 =====

// calcWeightAverage の結果
export interface WeightAverage {
  avgKg: number | null // 記録が1件もなければ null
  count: number // 7日間にあった記録の数
  isReference: boolean // 3件未満（参考値）
}

// calcWeekOverWeek の結果
export interface WeekOverWeek {
  diffKg: number | null // その日の7日平均 − 7日前の7日平均（どちらかが無ければ null）
  isReference: boolean // どちらかが参考値
}

// ===== フェーズ2 月の割り直し（11-3） =====

// start：開始月（初回設定の値） / plan：月初の7日平均が参考値なので計画どおり
// rebalanced：月初の7日平均で割り直し / finished：期間後 / provisional：まだ来ていない月（仮に計画どおり）
export type MonthTargetBasis = 'start' | 'plan' | 'rebalanced' | 'finished' | 'provisional'

// 画面が使う月の目標（useMonthTargets の結果）。CurrentMonthTargets に割り直しの情報を足したもの
export interface MonthTargets extends CurrentMonthTargets {
  basis: MonthTargetBasis
  startAvgKg: number | null // 月初の7日平均（前月の最後の7日間）
  startAvgCount: number
  gateEndTargetKg: number | null // そのゲートの終わりの目標体重
  remainingMonths: number | null // ゲートの残り月数（その月を含む）
  ahead: boolean // 目標kgが0以下（ペースより先に進んでいる）→ 1日の貯金は0
  shortfallKg: number // capped のとき、このままだとゲートに届かない見込みのkg
  cappedDismissed: boolean // capped の案内で「そのまま続ける」を選んだ
}

// monthly_targets テーブルの1行
export interface MonthlyTargetRow {
  id: string
  user_id: string
  goal_plan_id: string
  year: number
  month: number
  month_number: number
  gate_index: number
  basis: 'plan' | 'rebalanced'
  start_avg_kg: number | null
  start_avg_count: number
  gate_end_target_kg: number
  remaining_months: number
  monthly_target_kg: number
  daily_saving_kcal: number
  uncapped_kcal: number
  cap_kcal: number
  capped: boolean
  shortfall_kg: number
  capped_dismissed: boolean
  created_at: string
}

// ===== フェーズ2 進捗チャート（11-4） =====

export type ChartPeriod = '1m' | '3m' | 'all'

export interface WeightChartPoint {
  date: string // YYYY-MM-DD
  kg: number
}

// 目標ラインの区切り（開始日と各ゲートの終わり）
export interface TargetLinePoint extends WeightChartPoint {
  gateIndex: number | null // 開始点は null
}

export interface WeightChartData {
  from: string
  to: string
  days: number // from〜to の日数（両端を含む）
  dailyPoints: WeightChartPoint[] // 毎日の体重
  averageSegments: WeightChartPoint[][] // 7日平均の線（7日間に記録が無い日で途切れる）
  targetLine: WeightChartPoint[] // 範囲内の目標ライン（両端は補間した値）
  gateMarkers: { date: string; gateIndex: number }[] // 範囲内のゲートの区切り
  yMin: number
  yMax: number
}

// ===== フェーズ2 ゲート達成（11-5） =====

export type MilestoneKind = `gate${number}` | 'loss3' | 'loss5'

export interface Milestone {
  kind: MilestoneKind
  title: string // 「ゲート1達成！」「開始から3%減」
  message: string
}
