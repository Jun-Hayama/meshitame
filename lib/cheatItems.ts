// チートアイテム表（docs/v2-spec.md 10-6・13.2）
// kcalはすべてざっくりの目安。商品名・店名は使わない。調整するときはこのファイルだけを変更する
import type { CheatType, WantKind } from '@/types'
import { FOOD_ITEM_MAP, type FoodId } from '@/lib/foodItems'

export type CheatGenre =
  | 'ramen'
  | 'party'
  | 'alcohol'
  | 'snack_food'
  | 'meat'
  | 'donburi'
  | 'sushi'
  | 'pizza'
  | 'fastfood'
  | 'cake'
  | 'wagashi'
  | 'ice'
  | 'sweets'
  | 'bread'
  | 'fruit'
  | 'drink'

export interface CheatGenreDef {
  genre: CheatGenre
  label: string
  emoji: string
  defaultType: CheatType
  kind: WantKind // 既存の kind 列に入れる値（アイコン・デフォルトコスト用）
}

export const CHEAT_GENRES: CheatGenreDef[] = [
  { genre: 'ramen', label: 'ラーメン', emoji: '🍜', defaultType: 'replace', kind: 'ramen' },
  { genre: 'party', label: '飲み会', emoji: '🍻', defaultType: 'replace', kind: 'drinking_party' },
  { genre: 'alcohol', label: 'お酒', emoji: '🍺', defaultType: 'addon', kind: 'evening_drink' },
  { genre: 'snack_food', label: 'おつまみ', emoji: '🍢', defaultType: 'addon', kind: 'evening_drink' },
  { genre: 'meat', label: '焼肉・肉', emoji: '🥩', defaultType: 'replace', kind: 'other' },
  { genre: 'donburi', label: '丼・カレー', emoji: '🍛', defaultType: 'replace', kind: 'other' },
  { genre: 'sushi', label: '寿司・和食', emoji: '🍣', defaultType: 'replace', kind: 'other' },
  { genre: 'pizza', label: 'ピザ・パスタ・粉もの', emoji: '🍕', defaultType: 'replace', kind: 'other' },
  { genre: 'fastfood', label: 'ファストフード', emoji: '🍔', defaultType: 'replace', kind: 'other' },
  { genre: 'cake', label: 'ケーキ・洋菓子', emoji: '🍰', defaultType: 'addon', kind: 'other' },
  { genre: 'wagashi', label: '和菓子', emoji: '🍡', defaultType: 'addon', kind: 'other' },
  { genre: 'ice', label: 'アイス', emoji: '🍦', defaultType: 'addon', kind: 'other' },
  { genre: 'sweets', label: 'お菓子', emoji: '🍫', defaultType: 'addon', kind: 'other' },
  { genre: 'bread', label: 'パン', emoji: '🥐', defaultType: 'addon', kind: 'other' },
  { genre: 'fruit', label: 'フルーツ', emoji: '🍓', defaultType: 'addon', kind: 'other' },
  { genre: 'drink', label: 'ドリンク', emoji: '🧋', defaultType: 'addon', kind: 'other' },
]

export const CHEAT_GENRE_MAP: Record<CheatGenre, CheatGenreDef> = Object.fromEntries(
  CHEAT_GENRES.map((g) => [g.genre, g])
) as Record<CheatGenre, CheatGenreDef>

export interface CheatItem {
  genre: CheatGenre
  name: string
  kcal: number
  topping?: boolean // 「+250」のような追加トッピング（表示用）
  custom?: boolean // ユーザーが自由入力したもの
  foodId?: FoodId // 辞書（lib/foodItems.ts）の id。自由入力のものは無し
}

// 各ジャンルのアイテムは辞書（lib/foodItems.ts）の id で指定する。kcal は辞書の値を使う
// 表示名はチートの画面での名前（保存する中身の name。履歴の並べ替えにも使うので変えない）
const t = (genre: CheatGenre, rows: [FoodId, string, boolean?][]): CheatItem[] =>
  rows.map(([id, name, topping]) => ({
    genre,
    name,
    kcal: FOOD_ITEM_MAP[id].kcal,
    foodId: id,
    ...(topping ? { topping } : {}),
  }))

export const CHEAT_ITEMS: CheatItem[] = [
  ...t('ramen', [
    ['ramen_shoyu', '醤油・塩'], ['ramen_miso', '味噌'], ['ramen_tonkotsu', '豚骨'], ['ramen_iekei', '家系'],
    ['ramen_jiro', '二郎系'], ['tsukemen', 'つけ麺'],
    ['ramen_large_extra', '大盛り', true], ['kaedama', '替え玉', true], ['rice', 'ライス', true],
    ['gyoza', '餃子5個', true], ['han_chahan', '半チャーハン', true],
  ]),
  ...t('party', [
    ['party_light', '軽め（2〜3杯）'], ['party_normal', 'ふつう（4〜5杯）'], ['party_heavy', 'がっつり（6杯以上＋締め）'],
  ]),
  ...t('alcohol', [
    ['beer350', 'ビール350ml'], ['beer500', 'ビール500ml'], ['highball', 'ハイボール1杯'],
    ['lemon_sour', 'レモンサワー350ml'], ['sake', '日本酒1合'], ['shochu', '焼酎1杯'], ['umeshu', '梅酒1杯'],
    ['cocktail', 'カクテル1杯'], ['wine_glass', 'ワイン1杯'], ['wine_bottle', 'ワイン1本'],
  ]),
  ...t('snack_food', [
    ['edamame', '枝豆・冷奴'], ['sashimi', '刺身盛り'], ['yakitori3', '焼き鳥3本'], ['karaage', '唐揚げ'],
    ['fries_plate', 'フライドポテト'], ['shime_ramen', '締めのラーメン'],
  ]),
  ...t('meat', [
    ['yakiniku', '焼肉（ふつう）'], ['yakiniku_tabehoudai', '焼肉食べ放題'], ['steak300_rice', 'ステーキ300g＋ライス'],
    ['hamburg_set', 'ハンバーグ定食'], ['tonkatsu_set', 'とんかつ定食'],
  ]),
  ...t('donburi', [
    ['gyudon', '牛丼 並'], ['gyudon_large', '牛丼 大盛り'], ['katsudon', 'カツ丼'], ['tendon', '天丼'],
    ['curry', 'カレー'], ['katsu_curry', 'カツカレー'],
  ]),
  ...t('sushi', [
    ['sushi10', '回転寿司10皿'], ['sushi15', '回転寿司15皿'], ['tempura_soba', '天ぷらそば'], ['unaju', 'うな重'],
  ]),
  ...t('pizza', [
    ['pizza_m_half', 'ピザ M 半分'], ['pizza_m', 'ピザ M 1枚'], ['carbonara', 'カルボナーラ'],
    ['meat_sauce', 'ミートソース'], ['okonomiyaki', 'お好み焼き'], ['takoyaki', 'たこ焼き8個'],
  ]),
  ...t('fastfood', [
    ['hamburger', 'ハンバーガー'], ['double_burger', 'ダブルバーガー'], ['fries_m', 'ポテトM'], ['fries_l', 'ポテトL'],
    ['nuggets', 'ナゲット5個'], ['fried_chicken', 'フライドチキン1本'], ['shake', 'シェイク'],
  ]),
  ...t('cake', [
    ['shortcake', 'ショートケーキ'], ['cheesecake', 'チーズケーキ'], ['choco_cake', 'チョコケーキ'],
    ['montblanc', 'モンブラン'], ['cream_puff', 'シュークリーム'], ['donut', 'ドーナツ'], ['parfait', 'パフェ'],
    ['pancake_cream', 'パンケーキ'],
  ]),
  ...t('wagashi', [['daifuku', '大福'], ['dorayaki', 'どら焼き'], ['dango2', '団子2本'], ['taiyaki', 'たい焼き']]),
  ...t('ice', [['cup_ice', 'カップアイス'], ['soft_cream', 'ソフトクリーム'], ['ice_bar', 'アイスバー']]),
  ...t('sweets', [
    ['chips', 'ポテチ1袋'], ['chips_large', 'ポテチ大袋'], ['choco_bar', 'チョコ板1枚'], ['cookies5', 'クッキー5枚'],
    ['popcorn', 'ポップコーン'], ['senbei3', 'せんべい3枚'],
  ]),
  ...t('bread', [['melon_pan', 'メロンパン'], ['curry_pan', 'カレーパン'], ['croissant', 'クロワッサン'], ['kashi_pan', '菓子パン']]),
  ...t('fruit', [
    ['banana', 'バナナ1本'], ['apple', 'りんご1個'], ['mikan2', 'みかん2個'], ['grapes', 'ぶどう1房'],
    ['strawberry10', 'いちご10粒'],
  ]),
  ...t('drink', [
    ['tapioca', 'タピオカミルクティー'], ['frappe', 'フラペチーノ'], ['sweet_latte', '甘いカフェラテ'],
    ['cola500', 'コーラ500ml'],
  ]),
]
