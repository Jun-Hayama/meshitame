// チートアイテム表（docs/v2-spec.md 10-6）
// kcalはすべてざっくりの目安。商品名・店名は使わない。調整するときはこのファイルだけを変更する
import type { CheatType, WantKind } from '@/types'

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
}

const t = (genre: CheatGenre, rows: [string, number, boolean?][]): CheatItem[] =>
  rows.map(([name, kcal, topping]) => ({ genre, name, kcal, ...(topping ? { topping } : {}) }))

export const CHEAT_ITEMS: CheatItem[] = [
  ...t('ramen', [
    ['醤油・塩', 500], ['味噌', 650], ['豚骨', 750], ['家系', 950], ['二郎系', 1500], ['つけ麺', 800],
    ['大盛り', 250, true], ['替え玉', 250, true], ['ライス', 250, true], ['餃子5個', 250, true],
    ['半チャーハン', 400, true],
  ]),
  ...t('party', [['軽め（2〜3杯）', 1200], ['ふつう（4〜5杯）', 1800], ['がっつり（6杯以上＋締め）', 2500]]),
  ...t('alcohol', [
    ['ビール350ml', 140], ['ビール500ml', 200], ['ハイボール1杯', 80], ['レモンサワー350ml', 180],
    ['日本酒1合', 190], ['焼酎1杯', 140], ['梅酒1杯', 150], ['カクテル1杯', 150], ['ワイン1杯', 90],
    ['ワイン1本', 550],
  ]),
  ...t('snack_food', [
    ['枝豆・冷奴', 100], ['刺身盛り', 200], ['焼き鳥3本', 300], ['唐揚げ', 350], ['フライドポテト', 400],
    ['締めのラーメン', 500],
  ]),
  ...t('meat', [
    ['焼肉（ふつう）', 1200], ['焼肉食べ放題', 1800], ['ステーキ300g＋ライス', 1100], ['ハンバーグ定食', 900],
    ['とんかつ定食', 1000],
  ]),
  ...t('donburi', [
    ['牛丼 並', 650], ['牛丼 大盛り', 900], ['カツ丼', 900], ['天丼', 800], ['カレー', 800], ['カツカレー', 1100],
  ]),
  ...t('sushi', [['回転寿司10皿', 850], ['回転寿司15皿', 1250], ['天ぷらそば', 550], ['うな重', 900]]),
  ...t('pizza', [
    ['ピザ M 半分', 800], ['ピザ M 1枚', 1600], ['カルボナーラ', 800], ['ミートソース', 650],
    ['お好み焼き', 600], ['たこ焼き8個', 400],
  ]),
  ...t('fastfood', [
    ['ハンバーガー', 300], ['ダブルバーガー', 550], ['ポテトM', 400], ['ポテトL', 520], ['ナゲット5個', 270],
    ['フライドチキン1本', 250], ['シェイク', 350],
  ]),
  ...t('cake', [
    ['ショートケーキ', 350], ['チーズケーキ', 300], ['チョコケーキ', 400], ['モンブラン', 400],
    ['シュークリーム', 230], ['ドーナツ', 250], ['パフェ', 600], ['パンケーキ', 700],
  ]),
  ...t('wagashi', [['大福', 240], ['どら焼き', 280], ['団子2本', 260], ['たい焼き', 220]]),
  ...t('ice', [['カップアイス', 250], ['ソフトクリーム', 200], ['アイスバー', 150]]),
  ...t('sweets', [
    ['ポテチ1袋', 340], ['ポテチ大袋', 550], ['チョコ板1枚', 280], ['クッキー5枚', 250], ['ポップコーン', 300],
    ['せんべい3枚', 150],
  ]),
  ...t('bread', [['メロンパン', 400], ['カレーパン', 320], ['クロワッサン', 230], ['菓子パン', 350]]),
  ...t('fruit', [['バナナ1本', 90], ['りんご1個', 150], ['みかん2個', 80], ['ぶどう1房', 150], ['いちご10粒', 50]]),
  ...t('drink', [['タピオカミルクティー', 350], ['フラペチーノ', 400], ['甘いカフェラテ', 200], ['コーラ500ml', 220]]),
]
