// v2 計算ロジックの数値（docs/v2-spec.md 6章・6-3）
// 調整するときはこのファイルだけを変更する
import type { ReducePace, WantKind } from '@/types'

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

// 減らすペース（12-3）：1日の目安 = 必要量 − この値（kcal/日。月0/0.5/1/2kg相当）
export const REDUCE_PACE_KCAL: Record<ReducePace, number> = {
  keep: 0, // キープ
  slow: 120, // ゆっくり
  normal: 240, // ふつう
  hard: 480, // しっかり
}
export const DEFAULT_REDUCE_PACE: ReducePace = 'slow'

// 毎日の記録（1食あたりの差分。10-2のがっつりの例の基準にも使う）
export const MEAL_RECORD_DELTA = {
  light: -150, // ためメシ
  normal: 0, // いつもの
  hearty: 300, // がっつり
} as const

// ためメシ1回で貯まるpt（12-2）
export const TAMEMESHI_PT = -MEAL_RECORD_DELTA.light
// がっつり1回をチートとして目標に足すpt（12-2）
export const HEARTY_CHEAT_PT = MEAL_RECORD_DELTA.hearty

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

// 週の振り返り（12-5）：貯めたptを「◯◯ぶん」に言いかえる目安（kcalはチートアイテム表と同じ。小さい順）
export const WEEK_EARNED_EQUIVALENTS = [
  { pt: 140, label: 'ビール1本', emoji: '🍺' },
  { pt: 250, label: 'ケーキ1個', emoji: '🍰' },
  { pt: 400, label: 'ポテトM', emoji: '🍟' },
  { pt: 550, label: 'ワイン1本', emoji: '🍷' },
  { pt: 800, label: 'カレー1皿', emoji: '🍛' },
  { pt: 1200, label: '焼肉', emoji: '🥩' },
  { pt: 1800, label: '飲み会1回', emoji: '🍻' },
] as const
