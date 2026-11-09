// 目安くらいの例・がっつりの例のメニュー表（docs/v2-spec.md 10-2・13.2）
// 各例は辞書（lib/foodItems.ts）の id × 数量で書く。合計kcalは書かず、lib/calories.ts の calcMealExampleKcal で計算する
// 商品名・店名は使わない。調整するときはこのファイル（と辞書）だけを変更する
import type { MealSlot } from '@/types'
import type { FoodId } from '@/lib/foodItems'

export type MealGenre = 'washoku' | 'yoshoku' | 'chuka' | 'gaishoku' | 'konbini'

export const MEAL_GENRE_LABELS: Record<MealGenre, string> = {
  washoku: '和',
  yoshoku: '洋',
  chuka: '中',
  gaishoku: '外食',
  konbini: 'コンビニ',
}

export interface MealExampleItem {
  id: FoodId
  qty: number
}

export interface MealExample {
  name: string
  genre: MealGenre
  slots: MealSlot[]
  items: MealExampleItem[]
}

// 目安くらい = 目安の ±15%
export const MEAL_EXAMPLE_RANGE = 0.15
// 1つのリストに出す最大件数
export const MEAL_EXAMPLES_MAX = 8

const M: MealSlot[] = ['morning']
const LD: MealSlot[] = ['lunch', 'dinner']
const D: MealSlot[] = ['dinner']

// [id, 数量] の並び。数量1は id だけでよい
type Row = FoodId | [FoodId, number]
const ex = (name: string, genre: MealGenre, slots: MealSlot[], rows: Row[]): MealExample => ({
  name,
  genre,
  slots,
  items: rows.map((r) => (typeof r === 'string' ? { id: r, qty: 1 } : { id: r[0], qty: r[1] })),
})

export const MEAL_EXAMPLES: MealExample[] = [
  // --- 朝：和 ---
  ex('おにぎり＋味噌汁', 'washoku', M, ['onigiri_ume', 'miso_soup']),
  ex('お茶漬け＋漬物', 'washoku', M, ['ochazuke', 'tsukemono']),
  ex('おにぎり・ゆで卵・味噌汁', 'washoku', M, ['onigiri_salmon', 'boiled_egg', 'miso_soup']),
  ex('卵かけご飯＋味噌汁', 'washoku', M, ['rice', 'egg', 'miso_soup']),
  ex('納豆ご飯＋味噌汁', 'washoku', M, ['rice', 'natto', 'miso_soup']),
  ex('焼き鮭・ご飯・味噌汁・小鉢', 'washoku', M, ['rice', 'grilled_salmon', 'miso_soup', 'kobachi']),
  ex('納豆ご飯・卵焼き・味噌汁', 'washoku', M, ['rice', 'natto', 'tamagoyaki', 'miso_soup']),
  ex('豚汁・ご飯・卵焼き', 'washoku', M, ['rice', 'tonjiru', 'tamagoyaki']),
  ex('焼きさば・ご飯・味噌汁・漬物', 'washoku', M, ['rice', 'grilled_saba', 'miso_soup', 'tsukemono']),
  ex('ご飯大盛り・焼き鮭・卵焼き・味噌汁', 'washoku', M, ['rice_large', 'grilled_salmon', 'tamagoyaki', 'miso_soup']),
  ex('ご飯大盛り・焼きさば・納豆・味噌汁', 'washoku', M, ['rice_large', 'grilled_saba', 'natto', 'miso_soup']),
  ex('ご飯おかわり・焼きさば・納豆・卵焼き', 'washoku', M, [['rice', 2], 'grilled_saba', 'natto', 'tamagoyaki', 'miso_soup']),
  ex('ご飯大盛り2杯・焼きさば・卵焼き・豚汁', 'washoku', M, [['rice_large', 2], 'grilled_saba', 'tamagoyaki', 'tonjiru']),

  // --- 朝：洋 ---
  ex('ヨーグルト＋バナナ', 'yoshoku', M, ['yogurt', 'banana']),
  ex('トースト＋ゆで卵', 'yoshoku', M, ['toast', 'boiled_egg']),
  ex('ヨーグルト＋グラノーラ＋バナナ', 'yoshoku', M, ['yogurt', 'granola', 'banana']),
  ex('トースト・目玉焼き・ヨーグルト', 'yoshoku', M, ['toast', 'fried_egg', 'yogurt']),
  ex('トースト＋ベーコンエッグ', 'yoshoku', M, ['toast', 'bacon_egg']),
  ex('ハムチーズトースト・サラダ・カフェラテ', 'yoshoku', M, ['ham_cheese_toast', 'salad', 'latte']),
  ex('ホットサンド＋ポタージュ', 'yoshoku', M, ['hot_sandwich', 'potage']),
  ex('フレンチトースト＋ソーセージ', 'yoshoku', M, ['french_toast', 'sausage']),
  ex('パンケーキ＋ベーコンエッグ', 'yoshoku', M, ['pancake', 'bacon_egg']),
  ex('トースト2枚・ベーコンエッグ・ソーセージ', 'yoshoku', M, [['toast', 2], 'bacon_egg', 'sausage']),
  ex('パンケーキ・ベーコンエッグ・ソーセージ・牛乳', 'yoshoku', M, ['pancake', 'bacon_egg', 'sausage', 'milk']),
  ex('パンケーキ2皿・ソーセージ・カフェラテ', 'yoshoku', M, [['pancake', 2], 'sausage', 'latte']),
  ex('フレンチトースト・ベーコンエッグ・ソーセージ・ポテト', 'yoshoku', M, ['french_toast', 'bacon_egg', 'sausage', 'fries_m']),

  // --- 朝：中 ---
  ex('中華粥＋ゆで卵', 'chuka', M, ['chuka_kayu', 'boiled_egg']),
  ex('肉まん＋中華スープ', 'chuka', M, ['nikuman', 'egg_soup']),
  ex('中華粥＋肉まん', 'chuka', M, ['chuka_kayu', 'nikuman']),
  ex('肉まん2個＋中華スープ', 'chuka', M, [['nikuman', 2], 'egg_soup']),
  ex('中華粥・肉まん・春巻き', 'chuka', M, ['chuka_kayu', 'nikuman', 'harumaki']),
  ex('肉まん3個＋春巻き', 'chuka', M, [['nikuman', 3], 'harumaki']),

  // --- 朝：外食 ---
  ex('モーニング（トースト・ゆで卵・カフェラテ）', 'gaishoku', M, ['toast', 'boiled_egg', 'latte']),
  ex('朝定食（ご飯・卵・小鉢・味噌汁）', 'gaishoku', M, ['rice', 'egg', 'kobachi', 'miso_soup']),
  ex('ハンバーガー＋カフェラテ', 'gaishoku', M, ['hamburger', 'latte']),
  ex('朝の焼き鮭定食（納豆つき）', 'gaishoku', M, ['rice', 'grilled_salmon', 'natto', 'miso_soup', 'kobachi']),
  ex('朝の牛丼＋卵', 'gaishoku', M, ['gyudon', 'egg']),
  ex('ハンバーガー・ポテト・カフェラテ', 'gaishoku', M, ['hamburger', 'fries_m', 'latte']),
  ex('ホットドッグ・ポテト・甘いラテ', 'gaishoku', M, ['hotdog', 'fries_m', 'sweet_latte']),
  ex('朝の牛丼大盛り・卵・味噌汁', 'gaishoku', M, ['gyudon_large', 'egg', 'miso_soup']),
  ex('パン食べ放題のモーニング', 'gaishoku', M, [['croissant', 3], ['bread_roll', 2], 'bacon_egg', 'latte']),
  ex('ダブルバーガー・ポテト・シェイク', 'gaishoku', M, ['double_burger', 'fries_m', 'shake']),

  // --- 朝：コンビニ ---
  ex('サラダチキン＋ゆで卵', 'konbini', M, ['salad_chicken', 'boiled_egg']),
  ex('おにぎり＋サラダチキン', 'konbini', M, ['onigiri_salmon', 'salad_chicken']),
  ex('おにぎり2個', 'konbini', M, ['onigiri_salmon', 'onigiri_ume']),
  ex('サンドイッチ＋カフェラテ', 'konbini', M, ['sandwich', 'latte']),
  ex('おにぎり2個・ゆで卵・味噌汁', 'konbini', M, ['onigiri_salmon', 'onigiri_ume', 'boiled_egg', 'miso_soup']),
  ex('おにぎり＋サンドイッチ', 'konbini', M, ['onigiri_tunamayo', 'sandwich']),
  ex('おにぎり2個＋唐揚げ', 'konbini', M, ['onigiri_salmon', 'onigiri_ume', 'karaage']),
  ex('菓子パン2個', 'konbini', M, [['kashi_pan', 2]]),
  ex('菓子パン2個＋甘いラテ', 'konbini', M, [['kashi_pan', 2], 'sweet_latte']),
  ex('メロンパン・カレーパン・甘いラテ', 'konbini', M, ['melon_pan', 'curry_pan', 'sweet_latte']),
  ex('おにぎり3個＋カップ麺', 'konbini', M, ['onigiri_salmon', 'onigiri_ume', 'onigiri_tunamayo', 'cup_noodle']),
  ex('おにぎり2個・カップ麺・唐揚げ', 'konbini', M, ['onigiri_salmon', 'onigiri_ume', 'cup_noodle', 'karaage']),
  ex('菓子パン3個＋甘いラテ', 'konbini', M, [['kashi_pan', 3], 'sweet_latte']),

  // --- 昼・夜：和 ---
  ex('ざるそば', 'washoku', LD, ['zaru_soba']),
  ex('かけうどん＋おにぎり', 'washoku', LD, ['kake_udon', 'onigiri_ume']),
  ex('刺身定食', 'washoku', LD, ['rice', 'sashimi', 'miso_soup', 'kobachi']),
  ex('豚汁定食（焼き鮭つき）', 'washoku', LD, ['rice', 'tonjiru', 'grilled_salmon', 'tsukemono']),
  ex('寄せ鍋＋ご飯', 'washoku', D, ['yosenabe', 'rice']),
  ex('焼き魚定食', 'washoku', LD, ['rice', 'grilled_saba', 'miso_soup', 'kobachi']),
  ex('肉じゃが定食', 'washoku', LD, ['rice', 'nikujaga', 'miso_soup', 'hiyayakko']),
  ex('きつねうどん＋おにぎり', 'washoku', LD, ['kitsune_udon', 'onigiri_salmon']),
  ex('さばの味噌煮定食', 'washoku', LD, ['rice', 'saba_miso', 'miso_soup', 'kobachi']),
  ex('唐揚げ定食', 'washoku', LD, ['rice', 'karaage', 'miso_soup', 'salad']),
  ex('天ぷらそば＋おにぎり', 'washoku', LD, ['tempura_soba', 'onigiri_salmon']),
  ex('親子丼＋味噌汁', 'washoku', LD, ['oyakodon', 'miso_soup']),
  ex('生姜焼き定食', 'washoku', LD, ['rice', 'shogayaki', 'miso_soup', 'salad']),
  ex('とんかつ・ご飯・味噌汁・サラダ', 'washoku', LD, ['rice', 'tonkatsu', 'miso_soup', 'salad']),
  ex('ざるそば＋天ぷら', 'washoku', LD, ['zaru_soba', 'tempura']),
  ex('天丼＋味噌汁', 'washoku', LD, ['tendon', 'miso_soup']),
  ex('生姜焼き定食・ご飯大盛り', 'washoku', LD, ['rice_large', 'shogayaki', 'miso_soup', 'salad']),
  ex('うな重＋味噌汁', 'washoku', LD, ['unaju', 'miso_soup']),
  ex('唐揚げ定食・ご飯大盛り＋ポテサラ', 'washoku', LD, ['rice_large', 'karaage', 'miso_soup', 'potato_salad']),
  ex('すき焼き＋ご飯', 'washoku', D, ['sukiyaki', 'rice']),
  ex('刺身・天ぷら・ご飯大盛り・味噌汁', 'washoku', LD, ['sashimi', 'tempura', 'rice_large', 'miso_soup']),
  ex('すき焼き＋ご飯2杯', 'washoku', D, ['sukiyaki', ['rice', 2]]),
  ex('唐揚げ2皿・ご飯大盛り・豚汁', 'washoku', LD, [['karaage', 2], 'rice_large', 'tonjiru']),
  ex('すき焼き・ご飯2杯・〆のうどん', 'washoku', D, ['sukiyaki', ['rice', 2], 'udon_shime']),
  ex('すき焼き2人前・ご飯2杯・〆のうどん', 'washoku', D, [['sukiyaki', 2], ['rice', 2], 'udon_shime']),

  // --- 昼・夜：洋 ---
  ex('ミネストローネ・ロールパン2個・サラダ', 'yoshoku', LD, ['minestrone', ['bread_roll', 2], 'salad']),
  ex('サラダパスタ＋スープ', 'yoshoku', LD, ['salad_pasta', 'soup']),
  ex('グラタン＋サラダ', 'yoshoku', LD, ['gratin', 'salad']),
  ex('チキンソテー・ご飯・サラダ', 'yoshoku', LD, ['chicken_saute', 'rice', 'salad']),
  ex('ドリア＋サラダ', 'yoshoku', LD, ['doria', 'salad']),
  ex('ビーフシチュー＋ロールパン2個', 'yoshoku', LD, ['beef_stew', ['bread_roll', 2]]),
  ex('ペペロンチーノ・サラダ・スープ', 'yoshoku', LD, ['peperoncino', 'salad', 'soup']),
  ex('ナポリタン', 'yoshoku', LD, ['napolitan']),
  ex('ハンバーグ・ご飯・スープ', 'yoshoku', LD, ['hamburg', 'rice', 'soup']),
  ex('ミートソース＋ポタージュ', 'yoshoku', LD, ['meat_sauce', 'potage']),
  ex('ステーキ200g・ご飯・サラダ', 'yoshoku', LD, ['steak200', 'rice', 'salad']),
  ex('オムライス＋サラダ', 'yoshoku', LD, ['omurice', 'salad']),
  ex('カルボナーラ・サラダ・スープ', 'yoshoku', LD, ['carbonara', 'salad', 'soup']),
  ex('オムライス・ポタージュ・ポテサラ', 'yoshoku', LD, ['omurice', 'potage', 'potato_salad']),
  ex('ハンバーグ＆エビフライ・ご飯大盛り', 'yoshoku', LD, ['hamburg', 'ebi_fry', 'rice_large']),
  ex('ステーキ300g＋ライス', 'yoshoku', LD, ['steak300_rice']),
  ex('ステーキ200g×2・ご飯大盛り', 'yoshoku', LD, [['steak200', 2], 'rice_large']),
  ex('ハンバーグ2個・ご飯大盛り・ポタージュ', 'yoshoku', LD, [['hamburg', 2], 'rice_large', 'potage']),
  ex('ピザ M 1枚', 'yoshoku', LD, ['pizza_m']),
  ex('カルボナーラ＋ピザ半分', 'yoshoku', LD, ['carbonara', 'pizza_m_half']),

  // --- 昼・夜：中 ---
  ex('冷やし中華', 'chuka', LD, ['hiyashi_chuka']),
  ex('醤油ラーメン', 'chuka', LD, ['ramen_shoyu']),
  ex('麻婆豆腐・ご飯・中華スープ', 'chuka', LD, ['mabo_tofu', 'rice', 'egg_soup']),
  ex('青椒肉絲・ご飯・春巻き', 'chuka', LD, ['chinjao', 'rice', 'harumaki']),
  ex('天津飯＋中華スープ', 'chuka', LD, ['tenshindon', 'egg_soup']),
  ex('チャーハン＋中華スープ', 'chuka', LD, ['chahan', 'egg_soup']),
  ex('酢豚・ご飯・中華スープ', 'chuka', LD, ['subuta', 'rice', 'egg_soup']),
  ex('エビチリ・ご飯・春巻き・中華スープ', 'chuka', LD, ['ebi_chili', 'rice', 'harumaki', 'egg_soup']),
  ex('味噌ラーメン＋餃子', 'chuka', LD, ['ramen_miso', 'gyoza']),
  ex('ラーメン＋半チャーハン', 'chuka', LD, ['ramen_shoyu', 'han_chahan']),
  ex('中華丼＋餃子', 'chuka', LD, ['chukadon', 'gyoza']),
  ex('ラーメン・餃子・ライス', 'chuka', LD, ['ramen_shoyu', 'gyoza', 'rice']),
  ex('担々麺＋半チャーハン', 'chuka', LD, ['tantanmen', 'han_chahan']),
  ex('家系ラーメン＋ライス', 'chuka', LD, ['ramen_iekei', 'rice']),
  ex('豚骨ラーメン・替え玉・餃子', 'chuka', LD, ['ramen_tonkotsu', 'kaedama', 'gyoza']),
  ex('チャーハン・餃子2皿・春巻き', 'chuka', LD, ['chahan', ['gyoza', 2], 'harumaki']),
  ex('ラーメン・チャーハン・餃子', 'chuka', LD, ['ramen_shoyu', 'chahan', 'gyoza']),
  ex('二郎系ラーメン', 'chuka', LD, ['ramen_jiro']),
  ex('麻婆豆腐・エビチリ・酢豚・ご飯2杯', 'chuka', D, ['mabo_tofu', 'ebi_chili', 'subuta', ['rice', 2]]),
  ex('二郎系ラーメン＋餃子', 'chuka', LD, ['ramen_jiro', 'gyoza']),

  // --- 昼・夜：外食 ---
  ex('牛丼 並＋味噌汁', 'gaishoku', LD, ['gyudon', 'miso_soup']),
  ex('パスタランチ（パン・サラダ付き）', 'gaishoku', LD, ['peperoncino', 'bread_roll', 'salad']),
  ex('カレー＋サラダ', 'gaishoku', LD, ['curry', 'salad']),
  ex('回転寿司10皿', 'gaishoku', LD, ['sushi10']),
  ex('うどん・天ぷら・おにぎり', 'gaishoku', LD, ['kake_udon', 'tempura', 'onigiri_salmon']),
  ex('ハンバーガーセット', 'gaishoku', LD, ['hamburger', 'fries_m', 'cola500']),
  ex('カツ丼＋味噌汁', 'gaishoku', LD, ['katsudon', 'miso_soup']),
  ex('とんかつ定食', 'gaishoku', LD, ['tonkatsu_set']),
  ex('牛丼大盛り・卵・味噌汁', 'gaishoku', LD, ['gyudon_large', 'egg', 'miso_soup']),
  ex('カツカレー', 'gaishoku', LD, ['katsu_curry']),
  ex('焼肉（ふつう）', 'gaishoku', D, ['yakiniku']),
  ex('回転寿司15皿', 'gaishoku', LD, ['sushi15']),
  ex('ダブルバーガーセット（ポテトL）', 'gaishoku', LD, ['double_burger', 'fries_l', 'cola500']),
  ex('回転寿司15皿＋うどん', 'gaishoku', LD, ['sushi15', 'kake_udon']),
  ex('焼肉＋ご飯大盛り', 'gaishoku', D, ['yakiniku', 'rice_large']),
  ex('焼肉食べ放題', 'gaishoku', D, ['yakiniku_tabehoudai']),
  ex('焼肉食べ放題＋ビール2杯', 'gaishoku', D, ['yakiniku_tabehoudai', ['beer500', 2]]),

  // --- 昼・夜：コンビニ ---
  ex('サンドイッチ＋スープ', 'konbini', LD, ['sandwich', 'soup']),
  ex('おにぎり2個・サラダ・味噌汁', 'konbini', LD, ['onigiri_salmon', 'onigiri_ume', 'salad', 'miso_soup']),
  ex('おにぎり2個・サラダチキン・サラダ', 'konbini', LD, ['onigiri_salmon', 'onigiri_ume', 'salad_chicken', 'salad']),
  ex('カップ麺＋おにぎり', 'konbini', LD, ['cup_noodle', 'onigiri_salmon']),
  ex('パスタ＋サラダ', 'konbini', LD, ['konbini_pasta', 'salad']),
  ex('幕の内弁当', 'konbini', LD, ['makunouchi_bento']),
  ex('のり弁＋味噌汁', 'konbini', LD, ['nori_bento', 'miso_soup']),
  ex('唐揚げ弁当', 'konbini', LD, ['karaage_bento']),
  ex('焼き肉弁当', 'konbini', LD, ['yakiniku_bento']),
  ex('チキン南蛮弁当', 'konbini', LD, ['nanban_bento']),
  ex('のり弁＋カップ麺', 'konbini', LD, ['nori_bento', 'cup_noodle']),
  ex('大盛り弁当', 'konbini', LD, ['large_bento']),
  ex('唐揚げ弁当＋カップ麺', 'konbini', LD, ['karaage_bento', 'cup_noodle']),
  ex('パスタ2個＋サラダ', 'konbini', LD, [['konbini_pasta', 2], 'salad']),
  ex('大盛り弁当＋唐揚げ', 'konbini', LD, ['large_bento', 'karaage']),
  ex('大盛り弁当・カップ麺・おにぎり', 'konbini', LD, ['large_bento', 'cup_noodle', 'onigiri_salmon']),
]
