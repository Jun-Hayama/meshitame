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
export const MAX_LIGHT_MEALS_PER_WEEK = 7

// 欲望のコスト
export const WANT_COSTS: Record<WantKind, number> = {
  ramen: 500, // ラーメン
  drinking_party: 1000, // 飲み会
  evening_drink: 300, // 晩酌1回（ビール2本＋つまみ）
}

// メシポイント（1pt = 1kcal）
export const KCAL_PER_POINT = 1
export const EXERCISE_POINTS = {
  walking_30min: 150, // ウォーキング30分
  weights_60min: 300, // 筋トレ60分
  running_30min: 300, // ランニング30分
} as const
