import type { QUICK_EXERCISE_TYPES } from '@/lib/calorieConstants'

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
  capKcal: number // min(750, TDEE − 基礎代謝)
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
  replace_slot: MealSlot | null // 食事のチート（replace）のとき、どの食事か
  items: CheatItemSelection[] | null
  total_kcal: number | null
}

// 内部の区別（16章）：replace = 食事のチート（朝・昼・夜）/ addon = 追加チート。画面ではどちらも「チート」
export type CheatType = 'replace' | 'addon'

// チートを足した場所：朝・昼・夜（食事のチート）か、追加チート
export type CheatPlace = 'morning' | 'lunch' | 'dinner' | 'extra'

export const CHEAT_PLACE_LABELS: Record<CheatPlace, string> = {
  morning: '朝',
  lunch: '昼',
  dinner: '夜',
  extra: '追加チート',
}

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

// 記録の3択の表示名（12-1・13.1・16章）。DBの値（light / normal / hearty）は変えない
export const MEAL_CHOICE_LABELS: Record<MealChoice, string> = {
  light: 'メシため',
  normal: 'いつもの',
  hearty: 'チート', // 🔥チート（16章。DBの値は hearty のまま）
}

export const MEAL_CHOICE_EMOJI: Record<MealChoice, string> = {
  light: '🐷',
  normal: '🍚',
  hearty: '🔥',
}

// 減らすペース（12-3）。user_profiles.reduce_pace
export type ReducePace = 'keep' | 'slow' | 'normal' | 'hard'

export const REDUCE_PACE_LABELS: Record<ReducePace, string> = {
  keep: 'キープ',
  slow: 'ゆっくり',
  normal: 'ふつう',
  hard: 'しっかり',
}

export const REDUCE_PACE_ORDER: ReducePace[] = ['keep', 'slow', 'normal', 'hard']

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

// ===== v2.1 ゲージ（月で1本）・運動 =====

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
  steps: '👣',
}

// 運動の表示名（13.1）。テーブル名・型名（exercise）は変えない
export const EXERCISE_LABEL = 'うごため'
export const EXERCISE_EMOJI = '🏃'

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

// 品を選ばなかった🔥チート（meal_logs の hearty）1件（12-2・16章）
export interface HeartyCheatEntry {
  mode: 'hearty'
  date: string // YYYY-MM-DD
  slot: MealSlot
  costPt: number // 300
}

// 貯まったptの内訳（12-2・12-4）
export interface EarnedBreakdown {
  tamemeshiCount: number // メシため（light）の回数
  tamemeshiPt: number // メシため × 150
  exerciseCount: number // うごためを記録した回数
  exercisePt: number
  totalPt: number
}

// 週（12-5・16章）
export interface WeekSummary {
  from: string // 月曜
  to: string // 日曜
  earned: EarnedBreakdown
  cheats: MonthCheat[] // その週の日付のあるチートと品なしの🔥チート（頻度ベースは数えない）
  cheatKcal: number
  weightDiffKg: number | null // 日曜の7日平均 − 前の日曜の7日平均（記録がなければ null）
}

// ===== v2.6 ◯月のチート（16章） =====

// 数えるチート1件。carryover = 前月からの持ち越し / cheat = 日付のあるチート / hearty = 品なしの🔥チート
export interface MonthCheat {
  kind: 'carryover' | 'cheat' | 'hearty'
  key: string // 前後の比較用（行の id など）
  date: string // YYYY-MM-DD（持ち越しは月の初日）
  place: CheatPlace
  costKcal: number // 食事のチート：合計 − その食事の目安（下限0）/ 追加チート：合計 / 品なしの🔥チート：300
  row: MonthlyWantRow | null
}

// 前月から持ち越した分（v2.6.1：前月のチートのうち、前月末にまだの分。月末まで当てられる）
export interface Carryover {
  kcal: number
}

export interface CheatLedgerEntry {
  cheat: MonthCheat
  cumulativeKcal: number
  cleared: boolean // 累計 ≦ 貯めた分（なかったことに）
}

// 今月の、今日より後の予定
export interface PlannedCheat {
  cheat: MonthCheat
  ready: boolean // 余りで足りている
  shortKcal: number // その予定までに足りない分
  tamemeshiNeeded: number // 切り上げ(足りない分 ÷ 150)
}

// カードの状態：pending = A（まだの分がある）/ spare = B（ぜんぶ済みで余りがある）/ empty = C
export type CheatCardStage = 'pending' | 'spare' | 'empty'

export interface MonthCheatStatus {
  entries: CheatLedgerEntry[] // なかったことにする順番（持ち越し → 日付 → 朝・昼・夜・追加チート）
  earned: EarnedBreakdown // 貯めた分の内訳
  carryoverKcal: number // 前月から持ち越した分（ログの「先月の分」。月末まで出す）
  eatenKcal: number // 食べた分（持ち越しを含む・今日まで）
  savedKcal: number // 貯めた分
  clearedKcal: number // min(貯めた分, 食べた分)
  pendingKcal: number // まだの分
  spareKcal: number // 余り
  tamemeshiNeeded: number // 切り上げ(まだの分 ÷ 150)
  stage: CheatCardStage
  onTrack: boolean // 順調：食べた分 ≧ 1 かつ まだの分 0
  planned: PlannedCheat[]
}

// ===== v2.6.2 ◯月のチートのカード（16-追記 v2.6.2） =====

// 見出しの下の換算：「ビール約40缶ぶん」
export interface CheatEquivalent {
  name: string // 辞書の名前から（…）を外したもの
  unit: string // 辞書の単位
  count: number // 四捨五入（1以上）
  drink: boolean // お酒のジャンル（「飲んで」「飲みました」）
}

// 1本の棒（全体 = チートと貯めた分の大きいほう）。値はすべて棒の幅に対する割合（0〜1）
// short = 貯めた分 < チート / over = 貯めた分 > チート / exact = ちょうど同じ
export interface CheatCardBar {
  kind: 'short' | 'over' | 'exact'
  filled: number // 左から amber-400 で塗る幅
  short: number // 足りない部分の幅（最低 CHEAT_BAR_SHORT_MIN_RATIO）
  over: number // 超えた部分の幅
  markerAt: number | null // チートの位置の縦線（over・exact。チート0のときは出さない）
}

// いちばん手軽に届く方法（まだの分が300kcal以下のとき）
export interface EasiestWay {
  type: 'walking'
  minutes: number // 10分単位の切り上げ
}

// ===== v2.6.3 いつものうごため・記録のトースト（16-追記 v2.6.3） =====

// うごための4つのボタン（18-追記 v2.8.1）：種類×時間
export type QuickExerciseType = (typeof QUICK_EXERCISE_TYPES)[number]
// 設定画面の「うごための時間」（user_profiles.exercise_presets。分）
export type ExercisePresets = Record<QuickExerciseType, number>
export interface QuickExercise {
  type: QuickExerciseType
  minutes: number
}

// トーストを出す記録：メシため、またはうごため
export type RecordToastInput =
  | { kind: 'meshitame' }
  | { kind: 'exercise'; log: Pick<ExerciseLogRow, 'exercise_type' | 'minutes' | 'steps' | 'points'> }

// ヒントのシートの数
export interface CheatHints {
  pendingKcal: number
  tamemeshiCount: number
  walkingMinutes: number
  walking30Count: number // ウォーキング30分なら何回
  runningMinutes: number
  steps: number // 1万歩以上は千歩単位、それ未満は100歩単位で切り上げ
}

// ===== v2.4 ログ（14.3） =====

export type LogFilter = 'all' | 'meal' | 'cheat' | 'exercise'

export type LogEntry =
  | { kind: 'meal'; log: MealLogRow; kcal: number } // メシため（light）だけ。食事のチートがある食事は出さない
  | { kind: 'cheat'; cheat: MonthCheat; kcal: number }
  | { kind: 'exercise'; log: ExerciseLogRow; kcal: number }

export interface LogDay {
  date: string // YYYY-MM-DD
  entries: LogEntry[] // 朝・昼・夜・追加チート → うごため（記録した順）
}

// ===== v2.4 体重チャート：チートの累計（棒）＋体重（線）（14.4） =====

export type CheatChartPeriod = 'month' | 'all' // 今月 / はじめてから

// 食べたチート1件（日付のあるチートと品なしの🔥チート）
export interface CheatEvent {
  date: string
  costPt: number
  emoji: string
  name: string
  waterHeavy: boolean // むくみやすいチート（17章）
}

// 棒1本（今月は1日、はじめてからは1週）
export interface CheatChartBar {
  from: string
  to: string
  cumulativeKcal: number | null // その日（週の終わり）までの累計。今日より先は null（棒を出さない）
  events: CheatEvent[] // この日（週）に食べたチート
}

export interface CheatWeightPoint {
  index: number // 棒の番号（横の位置）
  kg: number
}

export interface CheatWeightChartData {
  period: CheatChartPeriod
  from: string
  to: string
  bars: CheatChartBar[]
  maxKcal: number // 棒の高さの最大（0なら棒なし）
  weightPoints: CheatWeightPoint[] // 体重の点（はじめてからは週の平均）
  weightSegments: CheatWeightPoint[][] // ならした線（記録が無いところで途切れる）
  yMin: number | null // 体重の縦の範囲（記録が無ければ null）
  yMax: number | null
  totalKcal: number // 見出しの累計 = 棒の最後
  weightChangeKg: number | null // 期間の体重の変化（条件が揃わなければ null）
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

export interface WeightChartPoint {
  date: string // YYYY-MM-DD
  kg: number
}

// 目標ラインの区切り（開始日と各ゲートの終わり）
export interface TargetLinePoint extends WeightChartPoint {
  gateIndex: number | null // 開始点は null
}

// ===== フェーズ2 ゲート達成（11-5） =====

export type MilestoneKind = `gate${number}` | 'loss3' | 'loss5'

export interface Milestone {
  kind: MilestoneKind
  title: string // 「3ヶ月目の目標体重に届きました」「開始から3%減」
  message: string
}

// ===== v2.7 戻り予報（17章） =====

// 直近のまとまり（むくみやすい日が続いたところ）と、そこから決まる日付・基準
export interface WaterRetention {
  date: string // 見ている日（保存した記録の日・今日）
  firstDate: string // まとまりの最初の日
  lastDate: string // まとまりの最後の日
  days: number // まとまりの日数
  dayNumber: number // 見ている日が何日目か（最後の日の翌日が1日目。最後の日は0）
  returnDate: string // 戻りそうな日（最後の日の3日後）
  inReturnPeriod: boolean // 1〜3日目
  baselineKg: number | null // 最初の日の前日までの7日平均（記録3件未満は null）
  afterLogs: Pick<WeightLog, 'measured_at' | 'weight_kg'>[] // チート後の記録（最初の日の翌日以降・見ている日まで。日付順）
}

// ===== v2.8 フレンドと一緒に食べる約束（18章） =====

// 足あとの見え方：cleared = なかったことにした（色つき）/ pending = まだ（今月の分・先月からの持ち越し。薄く）
// gone = 持ち越した月の月末までになかったことにできず消えた（ふつうの色）
export type FootprintLook = 'cleared' | 'pending' | 'gone'

export interface Footprint {
  pct: number // その日の近づき具合（0〜100）
  emoji: string
  count: number // 同じ位置・絵文字・見え方のものをまとめた数
  look: FootprintLook
}

export interface CheatCount {
  emoji: string
  count: number
}

// friend_progress に書き出す中身（kg は入れない）
export interface FriendProgressData {
  approachPct: number | null // null = 目標体重なし（コースに置かない）
  detour: boolean // ちょっと寄り道中
  waterEmoji: string | null // むくみ中の絵文字（むくみ中でなければ null）
  waterReturnDate: string | null
  footprints: Footprint[]
  cheatCounts: CheatCount[]
}

export type PromisePlace = 'lunch' | 'dinner' | 'extra'

export interface FriendProfileRow {
  user_id: string
  display_name: string
  character_emoji: string
  hide_cheats: boolean
  updated_at: string
}

export interface FriendProgressRow {
  user_id: string
  approach_pct: number | null
  detour: boolean
  water_emoji: string | null
  water_return_date: string | null
  footprints: Footprint[]
  cheat_counts: CheatCount[]
  updated_at: string
}

export interface PromiseRow {
  id: string
  creator_id: string
  promise_date: string
  place: PromisePlace
  items: CheatItemSelection[]
  label: string
  venue: string | null
  status: 'active' | 'canceled'
  created_at: string
}

export interface PromiseMemberRow {
  promise_id: string
  user_id: string
  joined_at: string
  ready_pct: number | null
  updated_at: string | null
  cheat_id: string | null
}

export interface FriendInviteRow {
  id: string
  creator_id: string
  token: string
  promise_id: string | null
  expires_at: string
  stopped_at: string | null
  created_at: string
}

// get_invite・join_invite の状態
export type InviteStatus =
  | 'ok'
  | 'not_found'
  | 'own'
  | 'stopped'
  | 'expired'
  | 'canceled'
  | 'past'
  | 'already'
  | 'full'
  | 'friend_limit'
  | 'no_profile'

export interface InviteView {
  status: InviteStatus
  creator_name: string | null
  creator_character: string | null
  promise: {
    date: string
    place: PromisePlace
    items: CheatItemSelection[]
    label: string
    venue: string | null
    status: 'active' | 'canceled'
  } | null
}
