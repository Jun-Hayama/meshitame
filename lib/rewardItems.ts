// ごほうび候補（docs/v2-spec.md 14.2）。「いまなら {品名} までいけます」に出す品
// 辞書（lib/foodItems.ts）の id × 数量で書く。kcal は辞書から計算する（lib/calories.ts の pickRewardItem）
// 並びは kcal の小さい順。調整するときはこのファイル（と辞書）だけを変更する
import type { MealExampleItem } from '@/lib/mealExamples'

export interface RewardItem {
  name: string
  items: MealExampleItem[]
}

export const REWARD_ITEMS: RewardItem[] = [
  { name: '高級アイス1個', items: [{ id: 'premium_ice', qty: 1 }] }, // 150
  { name: 'ワイン2杯', items: [{ id: 'wine_glass', qty: 2 }] }, // 180
  { name: '生ビール中ジョッキ', items: [{ id: 'draft_beer', qty: 1 }] }, // 200
  { name: 'ショートケーキ', items: [{ id: 'shortcake', qty: 1 }] }, // 350
  { name: '特上にぎり1人前', items: [{ id: 'tokujo_nigiri', qty: 1 }] }, // 500
  { name: 'こってりラーメン', items: [{ id: 'kotteri_ramen', qty: 1 }] }, // 650
  { name: '特上カルビ定食', items: [{ id: 'tokujo_karubi_set', qty: 1 }] }, // 800
  { name: 'うな重（特上）', items: [{ id: 'unaju_tokujo', qty: 1 }] }, // 1000
  { name: 'ステーキ300g＋ライス', items: [{ id: 'steak300_rice', qty: 1 }] }, // 1100
  { name: '焼肉食べ放題', items: [{ id: 'yakiniku_tabehoudai', qty: 1 }] }, // 1800
]
