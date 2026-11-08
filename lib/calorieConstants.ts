// v2 計算ロジックの数値（docs/v2-spec.md 6章・6-3）
// 調整するときはこのファイルだけを変更する
import type { WantKind } from '@/types'

// 体重換算
export const KCAL_PER_KG = 7200

// 標準体重の基準BMI
export const BMI_STANDARD = 22

// 年間の減量上限（BMI区分ごと。minBmi以上の最大の区分を使う）
export const ANNUAL_LOSS_LIMITS: { minBmi: number; rate: number }[] = [
  { minBmi: 0, rate: 0.05 },
  { minBmi: 25, rate: 0.15 },
  { minBmi: 35, rate: 0.2 },
]

// ゲート
export const GATE_MONTHS = 3
export const GATE_RATIOS_FOUR = [0.35, 0.3, 0.2, 0.15] // 4ゲート（12ヶ月）のときの配分
export const GATE1_MIN_RATIO = 0.03 // ゲート1の最低ライン（3ヶ月で現体重の3%）

// 1日の減量用貯金の上限
export const MAX_DAILY_SAVING_KCAL = 750

// 期間の目安計算に使う1ヶ月の平均日数
export const AVG_DAYS_PER_MONTH = 30.4

// 欲望用の貯金（目安パターンの合計 = 1日の目安カロリー − この値）
export const WANT_BUFFER_PER_DAY = 150

// 毎日の記録（1食あたりの差分）
export const MEAL_RECORD_DELTA = {
  light: -150, // 控えめ
  normal: 0, // 目安どおり
  hearty: 300, // がっつり
} as const

// 軽め
export const LIGHT_MEAL_KCAL = -MEAL_RECORD_DELTA.light // 軽め1回 = 控えめ1食（150kcal）

// 欲望のコスト
export const WANT_COSTS: Record<WantKind, number> = {
  ramen: 500, // ラーメン
  drinking_party: 1000, // 飲み会
  evening_drink: 300, // 晩酌1回（ビール2本＋つまみ）
  other: 300, // その他（中身を選んだチートは total_kcal を使うので、ふつうは使われない）
}

// メシポイント（1pt = 1kcal）
export const KCAL_PER_POINT = 1
export const EXERCISE_POINTS = {
  walking_30min: 150, // ウォーキング30分
  weights_60min: 300, // 筋トレ60分
  running_30min: 300, // ランニング30分
} as const

// 運動の1分あたりpt（10-5）。ウォーキング30分 = 150pt など上の値と一致させる
export const EXERCISE_PT_PER_MIN = {
  walking: 5, // ウォーキング
  running: 10, // ランニング
  weights: 5, // 筋トレ
  cycling: 7, // 自転車
  sports: 7, // スポーツ
} as const
// 歩数：1000歩 = 35pt
export const PT_PER_1000_STEPS = 35

// 過去の日の記録（10-7）：さかのぼれる日数（今日を含めて8日分）
export const RECORD_PAST_DAYS = 7

// 体重の記録（11-1）：入力できる範囲（kg）
export const WEIGHT_INPUT_MIN_KG = 30
export const WEIGHT_INPUT_MAX_KG = 300

// 7日間の平均（11-2）：その日を含む直近7日間。記録が3件未満なら参考値
export const WEIGHT_AVG_DAYS = 7
export const WEIGHT_AVG_MIN_COUNT = 3

// 進捗チャート（11-4）：期間の切り替え（日数）。全期間は開始日〜計画の終わり
export const CHART_PERIOD_DAYS = { '1m': 30, '3m': 90 } as const
// 縦軸の上下の余白（kg）
export const CHART_Y_PADDING_KG = 0.5

// ゲート達成と健康メリットの一言（11-5）。開始体重からの減量率で判定する（7日平均・参考値でないとき）
export const HEALTH_MILESTONES = [
  { kind: 'loss3', ratio: 0.03, message: '血糖値や中性脂肪の改善が期待できるライン' },
  { kind: 'loss5', ratio: 0.05, message: '血圧の改善も期待できるライン' },
] as const
