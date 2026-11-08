// 目安くらいの例・がっつりの例のメニュー表（docs/v2-spec.md 10-2）
// kcalはすべてざっくりの目安。商品名・店名は使わない。調整するときはこのファイルだけを変更する
import type { MealSlot } from '@/types'

export type MealGenre = 'washoku' | 'yoshoku' | 'gaishoku' | 'konbini'

export const MEAL_GENRE_LABELS: Record<MealGenre, string> = {
  washoku: '和',
  yoshoku: '洋',
  gaishoku: '外食',
  konbini: 'コンビニ',
}

export interface MealExample {
  name: string
  kcal: number
  genre: MealGenre
  slots: MealSlot[]
}

// 目安くらい = 目安の ±15%
export const MEAL_EXAMPLE_RANGE = 0.15
// 1つのリストに出す最大件数
export const MEAL_EXAMPLES_MAX = 5

const M: MealSlot[] = ['morning']
const LD: MealSlot[] = ['lunch', 'dinner']

export const MEAL_EXAMPLES: MealExample[] = [
  // --- 朝 ---
  { name: 'おにぎり1個＋味噌汁', kcal: 250, genre: 'washoku', slots: M },
  { name: 'お茶漬け＋漬物', kcal: 280, genre: 'washoku', slots: M },
  { name: '納豆ご飯＋味噌汁', kcal: 400, genre: 'washoku', slots: M },
  { name: '卵かけご飯＋味噌汁', kcal: 420, genre: 'washoku', slots: M },
  { name: '焼き鮭・ご飯・味噌汁・小鉢', kcal: 550, genre: 'washoku', slots: M },
  { name: 'ご飯大盛り・焼き魚・卵焼き・味噌汁', kcal: 750, genre: 'washoku', slots: M },
  { name: 'ご飯おかわり・納豆・卵焼き・焼き魚', kcal: 950, genre: 'washoku', slots: M },
  { name: 'ヨーグルト＋バナナ', kcal: 250, genre: 'yoshoku', slots: M },
  { name: 'トースト1枚＋ゆで卵', kcal: 300, genre: 'yoshoku', slots: M },
  { name: 'ヨーグルト＋グラノーラ＋バナナ', kcal: 350, genre: 'yoshoku', slots: M },
  { name: 'トースト＋目玉焼き＋ヨーグルト', kcal: 420, genre: 'yoshoku', slots: M },
  { name: 'ハムチーズトースト＋サラダ', kcal: 480, genre: 'yoshoku', slots: M },
  { name: 'ホットサンド＋スープ', kcal: 550, genre: 'yoshoku', slots: M },
  { name: 'フレンチトースト＋ソーセージ', kcal: 650, genre: 'yoshoku', slots: M },
  { name: 'パンケーキ＋ベーコンエッグ', kcal: 750, genre: 'yoshoku', slots: M },
  { name: 'パンケーキ3段＋ソーセージ', kcal: 1000, genre: 'yoshoku', slots: M },
  { name: 'パンケーキ＋ベーコンエッグ＋ポテト', kcal: 1150, genre: 'yoshoku', slots: M },
  { name: 'モーニングセット（トースト・ゆで卵）', kcal: 400, genre: 'gaishoku', slots: M },
  { name: '朝定食（ご飯・卵・小鉢・味噌汁）', kcal: 500, genre: 'gaishoku', slots: M },
  { name: '朝の牛丼＋卵', kcal: 650, genre: 'gaishoku', slots: M },
  { name: 'ハンバーガーの朝セット', kcal: 650, genre: 'gaishoku', slots: M },
  { name: '朝の牛丼大盛り＋卵＋味噌汁', kcal: 950, genre: 'gaishoku', slots: M },
  { name: 'ホットドッグ＋ポテト＋甘いラテ', kcal: 1050, genre: 'gaishoku', slots: M },
  { name: 'パン食べ放題のモーニング', kcal: 1250, genre: 'gaishoku', slots: M },
  { name: 'サラダチキン＋ゆで卵', kcal: 250, genre: 'konbini', slots: M },
  { name: 'おにぎり1個＋サラダチキン', kcal: 330, genre: 'konbini', slots: M },
  { name: 'おにぎり2個', kcal: 360, genre: 'konbini', slots: M },
  { name: 'サンドイッチ＋カフェラテ', kcal: 420, genre: 'konbini', slots: M },
  { name: 'おにぎり2個＋ゆで卵＋味噌汁', kcal: 480, genre: 'konbini', slots: M },
  { name: 'おにぎり2個＋からあげ', kcal: 600, genre: 'konbini', slots: M },
  { name: '菓子パン2個', kcal: 700, genre: 'konbini', slots: M },
  { name: '菓子パン2個＋カフェオレ', kcal: 900, genre: 'konbini', slots: M },
  { name: 'おにぎり3個＋カップ麺', kcal: 1050, genre: 'konbini', slots: M },
  { name: '菓子パン3個＋カフェオレ', kcal: 1200, genre: 'konbini', slots: M },

  // --- 昼・夜 ---
  { name: 'ざるそば', kcal: 400, genre: 'washoku', slots: LD },
  { name: 'きつねうどん', kcal: 450, genre: 'washoku', slots: LD },
  { name: '天ぷらそば', kcal: 550, genre: 'washoku', slots: LD },
  { name: '豚汁定食', kcal: 600, genre: 'washoku', slots: LD },
  { name: '刺身定食', kcal: 600, genre: 'washoku', slots: LD },
  { name: '焼き魚定食', kcal: 650, genre: 'washoku', slots: LD },
  { name: '寄せ鍋＋ご飯', kcal: 650, genre: 'washoku', slots: LD },
  { name: '親子丼', kcal: 700, genre: 'washoku', slots: LD },
  { name: '肉じゃが定食', kcal: 700, genre: 'washoku', slots: LD },
  { name: 'さばの味噌煮定食', kcal: 750, genre: 'washoku', slots: LD },
  { name: '生姜焼き定食', kcal: 850, genre: 'washoku', slots: LD },
  { name: '唐揚げ定食', kcal: 950, genre: 'washoku', slots: LD },
  { name: '生姜焼き定食・ご飯大盛り', kcal: 1100, genre: 'washoku', slots: LD },
  { name: 'すき焼き＋ご飯おかわり', kcal: 1300, genre: 'washoku', slots: LD },
  { name: '唐揚げ定食・ご飯大盛り＋小鉢', kcal: 1450, genre: 'washoku', slots: LD },
  { name: 'すき焼き＋ご飯2杯＋〆のうどん', kcal: 1650, genre: 'washoku', slots: LD },
  { name: 'ミネストローネ＋パン＋サラダ', kcal: 500, genre: 'yoshoku', slots: LD },
  { name: 'サラダパスタ', kcal: 550, genre: 'yoshoku', slots: LD },
  { name: 'グラタン＋サラダ', kcal: 600, genre: 'yoshoku', slots: LD },
  { name: 'チキンソテー＋サラダ＋パン', kcal: 650, genre: 'yoshoku', slots: LD },
  { name: 'チキンドリア', kcal: 650, genre: 'yoshoku', slots: LD },
  { name: 'ビーフシチュー＋パン', kcal: 700, genre: 'yoshoku', slots: LD },
  { name: 'ナポリタン', kcal: 750, genre: 'yoshoku', slots: LD },
  { name: 'オムライス', kcal: 800, genre: 'yoshoku', slots: LD },
  { name: 'ハンバーグ＋ライス', kcal: 850, genre: 'yoshoku', slots: LD },
  { name: 'ハンバーグ＋ライス＋スープ＋サラダ', kcal: 1000, genre: 'yoshoku', slots: LD },
  { name: 'オムライス大盛り＋スープ', kcal: 1150, genre: 'yoshoku', slots: LD },
  { name: 'ステーキ300g＋ライス', kcal: 1100, genre: 'yoshoku', slots: LD },
  { name: 'ハンバーグ＆エビフライ＋ライス大盛り', kcal: 1350, genre: 'yoshoku', slots: LD },
  { name: 'ステーキ400g＋ライス大盛り', kcal: 1600, genre: 'yoshoku', slots: LD },
  { name: 'ピザ M 1枚', kcal: 1600, genre: 'yoshoku', slots: LD },
  { name: '醤油ラーメン', kcal: 500, genre: 'gaishoku', slots: LD },
  { name: '牛丼 並', kcal: 650, genre: 'gaishoku', slots: LD },
  { name: 'パスタランチ（パン付き）', kcal: 750, genre: 'gaishoku', slots: LD },
  { name: 'カレー', kcal: 800, genre: 'gaishoku', slots: LD },
  { name: '回転寿司10皿', kcal: 850, genre: 'gaishoku', slots: LD },
  { name: 'ハンバーガーセット', kcal: 900, genre: 'gaishoku', slots: LD },
  { name: '焼肉定食', kcal: 900, genre: 'gaishoku', slots: LD },
  { name: 'ラーメン＋半チャーハン', kcal: 900, genre: 'gaishoku', slots: LD },
  { name: 'とんかつ定食', kcal: 1000, genre: 'gaishoku', slots: LD },
  { name: 'カツカレー', kcal: 1100, genre: 'gaishoku', slots: LD },
  { name: '家系ラーメン＋ライス', kcal: 1200, genre: 'gaishoku', slots: LD },
  { name: 'カツ丼大盛り', kcal: 1200, genre: 'gaishoku', slots: LD },
  { name: 'ラーメン＋餃子＋ライス', kcal: 1250, genre: 'gaishoku', slots: LD },
  { name: '回転寿司15皿', kcal: 1250, genre: 'gaishoku', slots: LD },
  { name: '二郎系ラーメン', kcal: 1500, genre: 'gaishoku', slots: LD },
  { name: 'ラーメン＋チャーハン＋餃子', kcal: 1650, genre: 'gaishoku', slots: LD },
  { name: '焼肉食べ放題', kcal: 1800, genre: 'gaishoku', slots: LD },
  { name: 'サンドイッチ＋スープ', kcal: 450, genre: 'konbini', slots: LD },
  { name: 'おにぎり2個＋サラダ＋スープ', kcal: 500, genre: 'konbini', slots: LD },
  { name: '冷やし中華', kcal: 500, genre: 'konbini', slots: LD },
  { name: 'カップ麺＋おにぎり', kcal: 550, genre: 'konbini', slots: LD },
  { name: '幕の内弁当', kcal: 650, genre: 'konbini', slots: LD },
  { name: 'パスタ＋サラダ', kcal: 650, genre: 'konbini', slots: LD },
  { name: 'のり弁', kcal: 700, genre: 'konbini', slots: LD },
  { name: '唐揚げ弁当', kcal: 850, genre: 'konbini', slots: LD },
  { name: '焼き肉弁当', kcal: 900, genre: 'konbini', slots: LD },
  { name: '大盛りパスタ', kcal: 900, genre: 'konbini', slots: LD },
  { name: 'チキン南蛮弁当', kcal: 1000, genre: 'konbini', slots: LD },
  { name: '大盛り弁当', kcal: 1100, genre: 'konbini', slots: LD },
  { name: '弁当＋カップ麺', kcal: 1300, genre: 'konbini', slots: LD },
  { name: '大盛り弁当＋からあげ', kcal: 1450, genre: 'konbini', slots: LD },
  { name: '大盛り弁当＋カップ麺', kcal: 1600, genre: 'konbini', slots: LD },
]
