'use client'

import { Fragment, MouseEvent, useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BlockType, EXERCISE_TYPES } from '@/types'
import { getWeekStart, formatDate, getWeekDates, getDayLabel } from '@/lib/calories'

// ── 型 ───────────────────────────────────────────────────────

type Slot =
  | 'meal_morning'
  | 'meal_lunch'
  | 'meal_snack'
  | 'meal_dinner'
  | 'meal_drinks'
  | 'exercise'

type AnchorKind = 'want' | 'healthy' | 'exercise' | 'note' | 'skip'
type SheetMode = 'healthy' | 'normal' | 'junk' | 'exercise' | 'note' | null

interface Anchor {
  id: string
  date: string
  slot: Slot
  block_type: BlockType
  kind: AnchorKind
  name: string
  calories: number
  duration_min?: number
  emoji: string
  is_want: boolean
  source: 'user' | 'ai'
}

// ── 定数 ─────────────────────────────────────────────────────

const SLOTS: { key: Slot; label: string; emoji: string }[] = [
  { key: 'meal_morning', label: '朝',    emoji: '🌅' },
  { key: 'meal_lunch',   label: '昼',    emoji: '🍱' },
  { key: 'meal_snack',   label: 'おやつ', emoji: '🍫' },
  { key: 'meal_dinner',  label: '夜',    emoji: '🍽' },
  { key: 'meal_drinks',  label: '晩酌',  emoji: '🍺' },
  { key: 'exercise',     label: '運動',  emoji: '🏃' },
]

const MEAL_SLOTS: Slot[] = ['meal_morning', 'meal_lunch', 'meal_snack', 'meal_dinner', 'meal_drinks']

// 短押し時にセットするデフォルトブロック
const SLOT_DEFAULTS: Record<Slot, Omit<Anchor, 'id' | 'date' | 'slot' | 'source'>> = {
  meal_morning: { block_type: 'meal_morning',     kind: 'healthy',  name: 'たんぱく質朝食', calories: 300, emoji: '🥚', is_want: false },
  meal_lunch:   { block_type: 'meal_lunch',        kind: 'want',     name: 'ラーメン',       calories: 800, emoji: '🍜', is_want: true  },
  meal_snack:   { block_type: 'meal_snack',        kind: 'healthy',  name: 'おやつ',         calories: 150, emoji: '🍫', is_want: false },
  meal_dinner:  { block_type: 'meal_dinner',       kind: 'healthy',  name: '和食定食',       calories: 550, emoji: '🐔', is_want: false },
  meal_drinks:  { block_type: 'meal_drinks',       kind: 'want',     name: 'ビール1本',      calories: 200, emoji: '🍺', is_want: true  },
  exercise:     { block_type: 'exercise_weights',  kind: 'exercise', name: '筋トレ60分',     calories: 350, duration_min: 60, emoji: '💪', is_want: false },
}

// 晩酌 drink_type → 表示情報マッピング
const DRINK_LABEL_MAP: { [key: string]: { emoji: string; label: string; unit: string } } = {
  beer:     { emoji: '🍺', label: 'ビール',    unit: '本' },
  highball: { emoji: '🥃', label: 'ハイボール', unit: '杯' },
  wine:     { emoji: '🍷', label: 'ワイン',     unit: '杯' },
  sake:     { emoji: '🍶', label: '日本酒',     unit: '合' },
  other:    { emoji: '🍸', label: 'お酒',       unit: '杯' },
}

// Supabase から読み込んだブロックへのフォールバック絵文字
const BLOCK_EMOJIS: Record<BlockType, string> = {
  meal_morning: '🌅', meal_lunch: '🍱', meal_snack: '🍫',
  meal_dinner: '🍽', meal_drinks: '🍺',
  exercise_weights: '💪', exercise_cardio: '🏃', exercise_sport: '⚽',
}

// ── メイン＋セット方式 ────────────────────────────────────

interface MainTemplate {
  name: string
  calories: number
  emoji: string
  category: 'healthy' | 'normal' | 'junk'
  description: string
  is_want: boolean
}

const MAIN_TEMPLATES: MainTemplate[] = [
  // ヘルシー系
  { name: '焼き魚',       calories: 200,  emoji: '🐟', category: 'healthy', description: '塩焼き・西京焼きなど魚料理',              is_want: false },
  { name: 'サラダチキン', calories: 180,  emoji: '🥗', category: 'healthy', description: 'コンビニやスーパーのサラダチキン単品',    is_want: false },
  { name: '蕎麦',         calories: 400,  emoji: '🍵', category: 'healthy', description: 'もり・ざる・かけ蕎麦など',               is_want: false },
  { name: '刺身',         calories: 250,  emoji: '🐠', category: 'healthy', description: '刺身盛り合わせ',                        is_want: false },
  // ノーマル系
  { name: '牛丼',         calories: 650,  emoji: '🍚', category: 'normal',  description: '吉野家・すき家・松屋など',               is_want: false },
  { name: 'カレー',       calories: 700,  emoji: '🍛', category: 'normal',  description: '一般的なカレーライス',                   is_want: false },
  { name: '親子丼',       calories: 600,  emoji: '🍳', category: 'normal',  description: '親子丼・他人丼など',                     is_want: false },
  { name: 'パスタ',       calories: 650,  emoji: '🍝', category: 'normal',  description: 'ナポリタン・ペペロンチーノなど',         is_want: false },
  { name: '唐揚げ',       calories: 450,  emoji: '🍗', category: 'normal',  description: '唐揚げ単品・3〜4個',                     is_want: false },
  { name: 'ハンバーグ',   calories: 500,  emoji: '🍖', category: 'normal',  description: 'ハンバーグ単品',                        is_want: false },
  { name: '寿司',         calories: 500,  emoji: '🍣', category: 'normal',  description: '回転寿司・スーパー寿司10貫程度',         is_want: false },
  { name: 'うどん',       calories: 450,  emoji: '🍜', category: 'normal',  description: 'きつね・天ぷらうどんなど',               is_want: false },
  { name: '海鮮丼',       calories: 550,  emoji: '🐙', category: 'normal',  description: '海鮮丼・ちらし寿司など',                 is_want: false },
  // ジャンキー系
  { name: '二郎系',       calories: 1200, emoji: '🍜', category: 'junk',    description: '大盛り・ニンニク・背脂系',               is_want: true  },
  { name: '焼肉',         calories: 800,  emoji: '🥩', category: 'junk',    description: '焼肉店での食事',                        is_want: true  },
  { name: 'バーガー',     calories: 700,  emoji: '🍔', category: 'junk',    description: 'ハンバーガーセット',                     is_want: true  },
  { name: 'ピザ',         calories: 900,  emoji: '🍕', category: 'junk',    description: 'ピザ（Mサイズ半分程度）',               is_want: true  },
  { name: '担々麺',       calories: 850,  emoji: '🍜', category: 'junk',    description: '担々麺・台湾まぜそばなど',               is_want: true  },
  { name: 'ステーキ',     calories: 900,  emoji: '🥩', category: 'junk',    description: 'ステーキ200g程度',                      is_want: true  },
  { name: 'もつ鍋',       calories: 700,  emoji: '🫕', category: 'junk',    description: 'もつ鍋・キムチ鍋など',                   is_want: true  },
  { name: 'お好み焼き',   calories: 700,  emoji: '🥞', category: 'junk',    description: 'お好み焼き・たこ焼きなど粉もの',         is_want: true  },
]

const SET_OPTIONS = [
  {
    id: 'none'    as const,
    label: 'セットなし',
    description: 'メインのみ',
    extraCalories: 0,
    emoji: '—',
  },
  {
    id: 'healthy' as const,
    label: 'ヘルシーセット',
    description: 'サラダ or 味噌汁',
    extraCalories: 100,
    emoji: '🥗',
  },
  {
    id: 'normal'  as const,
    label: 'ノーマルセット',
    description: 'ご飯＋味噌汁＋小鉢',
    extraCalories: 300,
    emoji: '🍱',
  },
  {
    id: 'junk'    as const,
    label: 'ジャンキーセット',
    description: '餃子 or ライス大盛り or 揚げ物',
    extraCalories: 400,
    emoji: '🍔',
  },
]

const EXERCISE_PRESETS: {
  name: string
  block_type: BlockType
  calories: number
  duration_min: number
  emoji: string
}[] = [
  { name: '筋トレ',       block_type: 'exercise_weights', calories: 250, duration_min: 45, emoji: '💪' },
  { name: 'ジョギング',   block_type: 'exercise_cardio',  calories: 300, duration_min: 30, emoji: '🏃' },
  { name: 'ウォーキング', block_type: 'exercise_cardio',  calories: 150, duration_min: 30, emoji: '🚶' },
  { name: 'ヨガ',         block_type: 'exercise_cardio',  calories: 150, duration_min: 30, emoji: '🧘' },
  { name: 'フットサル',   block_type: 'exercise_sport',   calories: 400, duration_min: 60, emoji: '⚽' },
  { name: '水泳',         block_type: 'exercise_sport',   calories: 350, duration_min: 30, emoji: '🏊' },
  { name: 'バスケ',       block_type: 'exercise_sport',   calories: 400, duration_min: 60, emoji: '🏀' },
  { name: 'サイクリング', block_type: 'exercise_cardio',  calories: 300, duration_min: 60, emoji: '🚴' },
]

const uid = () => Math.random().toString(36).slice(2, 10)

function slotOfBlockType(bt: BlockType): Slot {
  if (bt.startsWith('exercise_')) return 'exercise'
  return bt as Slot
}

// ── コンポーネント ────────────────────────────────────────────

export default function NewPlanPage() {
  const router = useRouter()

  // ── 週オフセット & 派生値 ─────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0)

  const weekStart = useMemo(() => {
    const base = getWeekStart()
    return new Date(base.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000)
  }, [weekOffset])

  const weekDates    = useMemo(() => getWeekDates(weekStart), [weekStart])
  const weekStartStr = useMemo(() => formatDate(weekStart),   [weekStart])
  const today        = formatDate(new Date())

  const weekLabel =
    weekOffset === 0  ? '今週' :
    weekOffset === -1 ? '先週' :
    weekOffset === 1  ? '来週' :
    weekOffset > 0    ? `${weekOffset}週後` : `${Math.abs(weekOffset)}週前`

  // ── ステート ────────────────────────────────────────────
  const [anchors, setAnchors]   = useState<Anchor[]>([])
  const [aiBlocks, setAiBlocks] = useState<Anchor[]>([])
  const [step, setStep]         = useState<'edit' | 'generating' | 'preview'>('edit')
  const [sheet, setSheet]       = useState<{ date: string; slot: Slot; initialMode?: SheetMode } | null>(null)
  const [popup, setPopup]       = useState<{ date: string; slot: Slot; x: number; y: number } | null>(null)
  const [aiSummary, setAiSummary]           = useState('')
  const [error, setError]                   = useState<string | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // ユーザープロフィール（マウント時に先読み）
  const [profileLoading, setProfileLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<{
    base_calories: number
    drink_type?: string
    drinks_per_day?: number
    drinks_calories_per_unit?: number
  } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('user_profiles')
        .select('base_calories, drink_type, drinks_per_day, drinks_calories_per_unit')
        .eq('id', user.id).maybeSingle()
      setUserProfile({
        base_calories:            data?.base_calories ?? 2200,
        drink_type:               data?.drink_type,
        drinks_per_day:           data?.drinks_per_day,
        drinks_calories_per_unit: data?.drinks_calories_per_unit,
      })
      setProfileLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const blocks: Anchor[] = step === 'preview' ? [...anchors, ...aiBlocks] : anchors

  const cellBlocks = (date: string, slot: Slot) =>
    blocks.filter(b => b.date === date && b.slot === slot)

  // ── カロリーサマリ（派生） ────────────────────────────────
  const calorieSummary = useMemo(() => {
    let totalIn = 0, totalBurned = 0
    for (const b of blocks) {
      if (b.kind === 'note' || b.kind === 'skip') continue
      if ((MEAL_SLOTS as string[]).includes(b.slot)) totalIn     += b.calories
      else if (b.slot === 'exercise')                totalBurned += b.calories
    }
    return { totalIn, totalBurned, net: totalIn - totalBurned }
  }, [blocks])

  // ── 週変更時：Supabase から既存ブロック読み込み ────────────
  useEffect(() => {
    if (step !== 'generating') {
      setStep('edit')
      setAiBlocks([])
      setAiSummary('')
      setError(null)
    }
    loadWeekBlocks()
  }, [weekStartStr]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadWeekBlocks() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: weekPlan } = await supabase
      .from('week_plans').select('id')
      .eq('user_id', user.id).eq('week_start', weekStartStr)
      .maybeSingle()

    if (!weekPlan) { setAnchors([]); return }

    const { data: dbBlocks } = await supabase
      .from('plan_blocks').select('*').eq('week_plan_id', weekPlan.id)

    if (dbBlocks) {
      setAnchors(dbBlocks.map(b => ({
        id:           uid(),
        date:         b.plan_date,
        slot:         slotOfBlockType(b.block_type as BlockType),
        block_type:   b.block_type as BlockType,
        kind:         b.is_want
          ? ('want' as AnchorKind)
          : EXERCISE_TYPES.includes(b.block_type as BlockType) ? 'exercise' : 'healthy',
        name:         b.name,
        calories:     b.calories,
        duration_min: b.duration_min ?? undefined,
        emoji:        BLOCK_EMOJIS[b.block_type as BlockType] ?? '🍽',
        is_want:      b.is_want,
        source:       b.is_ai_generated ? ('ai' as const) : ('user' as const),
      })))
    }
  }

  // 晩酌スロットの即セット値をプロフィールから動的生成
  function getDrinksDefault(): Omit<Anchor, 'id' | 'date' | 'slot' | 'source'> {
    const dr = userProfile
    if (!dr?.drink_type || !dr?.drinks_per_day || !dr?.drinks_calories_per_unit) {
      return SLOT_DEFAULTS.meal_drinks // フォールバック: ビール1本 200kcal
    }
    const { emoji, label, unit } = DRINK_LABEL_MAP[dr.drink_type] ?? DRINK_LABEL_MAP.beer
    return {
      block_type: 'meal_drinks',
      kind:       'want',
      name:       `${label}×${dr.drinks_per_day}${unit}`,
      calories:   dr.drinks_calories_per_unit * dr.drinks_per_day,
      emoji,
      is_want:    true,
    }
  }

  // ── タップ：ミニポップアップを表示（運動は直接シート） ────
  function handleCellClick(e: MouseEvent<HTMLButtonElement>, date: string, slot: Slot) {
    if (step !== 'edit') return
    if (slot === 'exercise') {
      setSheet({ date, slot })
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const PW = 252
    setPopup({
      date, slot,
      x: Math.max(8, Math.min(rect.left + rect.width / 2 - PW / 2, window.innerWidth - PW - 8)),
      y: rect.top > 80 ? rect.top - 76 : rect.bottom + 8,
    })
  }

  // ── アンカー操作 ──────────────────────────────────────────
  function addAnchor(
    date: string,
    slot: Slot,
    partial: Omit<Anchor, 'id' | 'date' | 'slot' | 'source'>,
  ) {
    setAnchors(prev => {
      const base = slot === 'exercise'
        ? prev
        : prev.filter(a => !(a.date === date && a.slot === slot))
      return [...base, { ...partial, id: uid(), date, slot, source: 'user' }]
    })
  }

  function clearSlot(date: string, slot: Slot) {
    setAnchors(prev => prev.filter(a => !(a.date === date && a.slot === slot)))
  }

  function removeAnchor(id: string) {
    setAnchors(prev => prev.filter(a => a.id !== id))
  }

  // ── プラン生成 ────────────────────────────────────────────
  async function generate() {
    setError(null)
    setStep('generating')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    // is_want ブロックのみ name/emoji を送り、他は最小フィールドに絞る
    const anchorPayload = anchors.filter(a => a.kind !== 'note' && a.kind !== 'skip').map(a => ({
      plan_date:  a.date,
      block_type: a.block_type,
      calories:   a.calories,
      is_want:    a.is_want,
      is_anchor:  true,
      ...(a.is_want ? { name: a.name, emoji: a.emoji } : {}),
    }))

    const skipSlots = anchors
      .filter(a => a.kind === 'skip')
      .map(a => ({ plan_date: a.date, slot: a.slot }))

    try {
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorBlocks: anchorPayload,
          skipSlots,
          userProfile:  userProfile || { base_calories: 2200 },
          weekDates,
        }),
      })
      const data = await res.json()

      if (res.status === 408 || data.error === 'timeout') {
        setError('プラン生成に時間がかかっています。もう一度お試しください。')
        setStep('edit')
        return
      }
      if (data.error || !data.blocks) {
        setError('AIプランの生成に失敗しました。もう一度お試しください。')
        setStep('edit')
        return
      }

      const filledNonExercise = new Set(
        anchors
          .filter(a => a.slot !== 'exercise' && a.kind !== 'note')
          .map(a => `${a.date}|${a.slot}`),
      )
      // skip スロットも AI 補完から除外する
      skipSlots.forEach(s => filledNonExercise.add(`${s.plan_date}|${s.slot}`))

      const ai: Anchor[] = (data.blocks as Array<{
        plan_date: string
        block_type: BlockType
        name: string
        calories: number
        duration_min?: number | null
        is_want?: boolean
        emoji?: string
        is_anchor?: boolean
      }>)
        .filter(b => {
          if (b.is_anchor) return false
          const slot = slotOfBlockType(b.block_type)
          if (slot !== 'exercise' && filledNonExercise.has(`${b.plan_date}|${slot}`)) return false
          return true
        })
        .map(b => ({
          id: uid(),
          date: b.plan_date,
          slot: slotOfBlockType(b.block_type),
          block_type: b.block_type,
          kind: b.is_want
            ? 'want'
            : EXERCISE_TYPES.includes(b.block_type)
              ? 'exercise'
              : 'healthy',
          name: b.name,
          calories: b.calories,
          duration_min: b.duration_min ?? undefined,
          emoji: b.emoji || '',
          is_want: !!b.is_want,
          source: 'ai' as const,
        }))

      setAiBlocks(ai)
      setAiSummary(data.summary || '')
      setStep('preview')
    } catch {
      setError('通信エラーが発生しました')
      setStep('edit')
    }
  }

  // ── コミット（Supabase 保存） ──────────────────────────────
  async function commit() {
    setError(null)
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const weekEnd = formatDate(new Date(weekStart.getTime() + 6 * 86400000))

    const { data: existing } = await supabase
      .from('week_plans').select('id')
      .eq('user_id', user.id).eq('week_start', weekStartStr).single()

    if (existing) {
      await supabase.from('plan_blocks').delete().eq('week_plan_id', existing.id)
      await supabase.from('weekly_intentions').delete().eq('week_plan_id', existing.id)
      const { error: upErr } = await supabase.from('week_plans')
        .update({ status: 'active', ai_summary: aiSummary }).eq('id', existing.id)
      if (upErr) { setError('週プランの更新に失敗: ' + upErr.message); setSaving(false); return }
    } else {
      const { error: insErr } = await supabase.from('week_plans').insert({
        user_id: user.id, week_start: weekStartStr, week_end: weekEnd,
        status: 'active', ai_summary: aiSummary,
      })
      if (insErr) { setError('週プランの保存に失敗: ' + insErr.message); setSaving(false); return }
    }

    const { data: wp, error: wpErr } = await supabase
      .from('week_plans').select('id')
      .eq('user_id', user.id).eq('week_start', weekStartStr).single()
    if (wpErr || !wp) { setError('週プランの取得に失敗'); setSaving(false); return }

    const wantItems = aggregateWantItems(anchors)
    const { error: intErr } = await supabase.from('weekly_intentions').insert({
      week_plan_id: wp.id, user_id: user.id,
      want_items: wantItems, daily_drinks: false, daily_drinks_count: 0,
      daily_drinks_calories: 0,
      allow_snacks: anchors.some(a => a.slot === 'meal_snack'),
      snack_calories_per_day: 150, schedule_notes: '',
    })
    if (intErr) { setError('欲望宣言の保存に失敗: ' + intErr.message); setSaving(false); return }

    const all = [...anchors, ...aiBlocks].filter(b => b.kind !== 'note' && b.kind !== 'skip')
    if (all.length > 0) {
      const rows = all.map((b, i) => ({
        week_plan_id: wp.id, user_id: user.id, plan_date: b.date,
        block_type: b.block_type, name: b.name, calories: b.calories,
        duration_min: b.duration_min ?? null, is_want: b.is_want,
        is_ai_generated: b.source === 'ai', is_flexible: b.source === 'ai',
        sort_order: i, status: 'planned',
      }))
      const { error: blkErr } = await supabase.from('plan_blocks').insert(rows)
      if (blkErr) { setError('ブロックの保存に失敗: ' + blkErr.message); setSaving(false); return }
    }

    router.replace('/plan')
  }

  // ── リセット ──────────────────────────────────────────────
  async function resetWeek() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: weekPlan } = await supabase
      .from('week_plans').select('id')
      .eq('user_id', user.id).eq('week_start', weekStartStr).maybeSingle()

    if (weekPlan) {
      await supabase.from('plan_blocks').delete().eq('week_plan_id', weekPlan.id)
      await supabase.from('weekly_intentions').delete().eq('week_plan_id', weekPlan.id)
      await supabase.from('week_plans').delete().eq('id', weekPlan.id)
    }

    setAnchors([])
    setAiBlocks([])
    setAiSummary('')
    setStep('edit')
    setShowResetConfirm(false)
  }

  // ── レンダリング ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-32">

      {/* ── ヘッダー ── */}
      <header className="px-5 pt-12 pb-3 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-stone-500 text-xl" aria-label="戻る">←</button>
        <h1 className="text-lg font-bold flex-1">
          {step === 'preview' ? 'プランプレビュー' : '今週の欲望を置く'}
        </h1>
        {step !== 'generating' && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="text-stone-500 text-sm px-2 py-1"
            aria-label="リセット"
          >
            🗑
          </button>
        )}
      </header>

      {error && <p className="px-5 mb-3 text-rose-400 text-xs">{error}</p>}

      {/* ── 週切り替え ── */}
      <div className="flex items-center justify-between px-4 mb-1">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="w-10 h-10 flex items-center justify-center text-stone-400 rounded-xl active:bg-stone-800"
        >
          ←
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-stone-200">{weekLabel}</p>
          <p className="text-stone-500 text-xs">
            {weekStart.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}〜
          </p>
        </div>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="w-10 h-10 flex items-center justify-center text-stone-400 rounded-xl active:bg-stone-800"
        >
          →
        </button>
      </div>

      {step === 'edit' && (
        <p className="text-stone-600 text-[11px] text-center mb-2">
          セルをタップして入力
        </p>
      )}

      {/* ── カレンダーグリッド ── */}
      <div className="px-2">
        <div className="overflow-x-auto">
          <div
            className="grid gap-1 min-w-[360px]"
            style={{ gridTemplateColumns: '44px repeat(7, minmax(40px, 1fr))' }}
          >
            {/* 曜日ヘッダー */}
            <div />
            {weekDates.map(date => {
              const isToday = date === today
              const d = new Date(date)
              return (
                <div
                  key={`h-${date}`}
                  className={`text-center py-1 rounded-lg ${
                    isToday
                      ? 'bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/40'
                      : 'text-stone-400'
                  }`}
                >
                  <div className="text-[10px] leading-none">{getDayLabel(date)}</div>
                  <div className="text-sm font-bold leading-tight">{d.getDate()}</div>
                </div>
              )
            })}

            {/* スロット行 */}
            {SLOTS.map(slotMeta => (
              <Fragment key={slotMeta.key}>
                <div className="flex flex-col items-center justify-center text-stone-500 text-[10px] leading-tight py-1">
                  <span className="text-base leading-none">{slotMeta.emoji}</span>
                  <span className="mt-0.5">{slotMeta.label}</span>
                </div>

                {weekDates.map(date => {
                  const isToday    = date === today
                  const items      = cellBlocks(date, slotMeta.key)
                  const first      = items[0]
                  const more       = items.length - 1
                  const isWant     = !!first?.is_want
                  const isNote     = first?.kind === 'note'
                  const isSkip     = first?.kind === 'skip'
                  const isAi       = first?.source === 'ai'

                  return (
                    <button
                      key={`c-${date}-${slotMeta.key}`}
                      onClick={e => handleCellClick(e, date, slotMeta.key)}
                      className={`relative min-h-[52px] rounded-lg flex flex-col items-center justify-center px-0.5 text-[10px] leading-tight select-none
                        ${
                          isSkip
                            ? 'bg-stone-900 border border-dashed border-stone-700 text-stone-600'
                            : isWant
                              ? 'bg-amber-400 text-stone-950 font-bold'
                              : isNote
                                ? 'bg-stone-800/80 text-stone-400 border border-dashed border-stone-700'
                                : first
                                  ? isAi
                                    ? 'bg-stone-800 text-stone-200 border border-stone-700'
                                    : 'bg-emerald-400/15 text-emerald-200 border border-emerald-400/30'
                                  : isToday
                                    ? 'bg-amber-400/5 border border-amber-400/20 text-stone-600'
                                    : 'bg-stone-900 text-stone-700'
                        }`}
                    >
                      {first ? (
                        isSkip ? (
                          <>
                            <span className="text-base leading-none">🚫</span>
                            <span className="truncate w-full text-center mt-0.5 text-[9px]">食べない</span>
                          </>
                        ) : (
                          <>
                            {isWant && (
                              <span className="absolute top-0.5 right-0.5 text-[9px]">★</span>
                            )}
                            <span className="text-base leading-none">{first.emoji || '•'}</span>
                            <span className="truncate w-full text-center mt-0.5">{first.name}</span>
                            {more > 0 && (
                              <span className="absolute bottom-0.5 right-1 text-[9px] opacity-80">+{more}</span>
                            )}
                          </>
                        )
                      ) : (
                        <span className="text-stone-700 text-lg leading-none">+</span>
                      )}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ── 凡例 ── */}
      <div className="px-5 mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-500">
        <Legend color="bg-amber-400" label="★ 欲望" />
        <Legend color="bg-emerald-400/30" label="ヘルシー" />
        <Legend color="bg-stone-700" label="AI補完" />
        <Legend color="bg-stone-800 border border-dashed border-stone-600" label="予定メモ" />
        <Legend color="bg-stone-900 border border-dashed border-stone-700" label="🚫 食べない" />
      </div>

      {/* ── AI サマリ（preview） ── */}
      {step === 'preview' && aiSummary && (
        <div className="mx-5 mt-4 bg-stone-900 rounded-2xl p-4">
          <p className="text-amber-400 text-xs font-bold mb-1">今週のAIメモ</p>
          <p className="text-stone-300 text-sm leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* ── カロリーサマリ ── */}
      <div className="mx-3 mt-4 bg-stone-900 rounded-2xl p-4">
        <p className="text-stone-500 text-xs mb-3">
          今週のカロリー{step === 'preview' ? '（AI補完後）' : '（アンカー合計）'}
        </p>
        <div className="grid grid-cols-3 divide-x divide-stone-800 text-center">
          <div className="px-2">
            <p className="text-stone-500 text-[11px] mb-1">摂取</p>
            <p className="text-stone-100 font-bold tabular-nums">
              {calorieSummary.totalIn.toLocaleString()}
            </p>
            <p className="text-stone-600 text-[10px]">kcal</p>
          </div>
          <div className="px-2">
            <p className="text-stone-500 text-[11px] mb-1">消費</p>
            <p className="text-emerald-400 font-bold tabular-nums">
              −{calorieSummary.totalBurned.toLocaleString()}
            </p>
            <p className="text-stone-600 text-[10px]">kcal</p>
          </div>
          <div className="px-2">
            <p className="text-stone-500 text-[11px] mb-1">差引</p>
            <p className={`font-bold tabular-nums ${
              calorieSummary.net <= 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {calorieSummary.net > 0
                ? calorieSummary.net.toLocaleString()
                : `−${Math.abs(calorieSummary.net).toLocaleString()}`}
            </p>
            <p className="text-stone-600 text-[10px]">kcal</p>
          </div>
        </div>

        {/* カロリー判定 */}
        {(() => {
          const tdeeWeekly  = (userProfile?.base_calories ?? 2200) * 7
          const netCalories = calorieSummary.net
          const deficit     = tdeeWeekly - netCalories
          const weeklyLoss  = Math.round((deficit / 7200) * 10) / 10
          const wantCount   = blocks.filter(b => b.is_want).length

          let mainText: string
          let mainColor: string
          if (weeklyLoss >= 0.5) {
            mainText  = `このペースなら週${weeklyLoss}kg減 🔥`
            mainColor = 'text-emerald-400'
          } else if (weeklyLoss >= 0.1) {
            mainText  = `少しずつ絞れるペース ✅ 週${weeklyLoss}kg減`
            mainColor = 'text-emerald-400'
          } else if (weeklyLoss >= -0.1) {
            mainText  = '維持ペース。欲望全部叶えてOK 👍'
            mainColor = 'text-amber-400'
          } else {
            mainText  = '少し運動を足せばバランス良くなる 💪'
            mainColor = 'text-amber-400'
          }

          return (
            <div className="mt-3 pt-3 border-t border-stone-800 space-y-2">
              <p className={`text-2xl font-bold ${mainColor}`}>{mainText}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-500">週目標 {tdeeWeekly.toLocaleString()} kcal</span>
                {wantCount > 0 && (
                  <span className="text-amber-400">★ 欲望 {wantCount}個 全部叶えてOK！</span>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── 固定ボタン ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-stone-950 via-stone-950 to-stone-950/60 px-5 pt-10 pb-6 pointer-events-none">
        <div className="pointer-events-auto">
          {step === 'edit' && (
            <button
              onClick={generate}
              disabled={profileLoading}
              className="w-full bg-amber-400 text-stone-950 font-bold py-4 rounded-2xl text-base active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {profileLoading ? 'プロフィール読み込み中...' : 'AIに残りを補完してもらう 🍜'}
            </button>
          )}
          {step === 'preview' && (
            <div className="flex gap-3">
              <button
                onClick={() => { setAiBlocks([]); setAiSummary(''); setStep('edit') }}
                className="flex-1 bg-stone-800 text-stone-300 font-medium py-4 rounded-2xl text-sm"
              >
                編集に戻る
              </button>
              <button
                onClick={commit}
                disabled={saving}
                className="flex-1 bg-amber-400 text-stone-950 font-bold py-4 rounded-2xl text-sm disabled:opacity-50"
              >
                {saving ? '保存中...' : 'このプランで決定する'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── ローディング ── */}
      {step === 'generating' && (
        <div className="fixed inset-0 z-40 bg-stone-950/95 flex flex-col items-center justify-center gap-6">
          <div className="text-6xl animate-bounce">🍜</div>
          <div className="text-center px-6">
            <p className="text-amber-400 font-bold text-lg">プランを設計中...</p>
            <p className="text-stone-500 text-sm mt-2">欲望を全部叶える週を組んでいます</p>
          </div>
        </div>
      )}

      {/* ── ミニポップアップ ── */}
      {popup && step === 'edit' && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setPopup(null)} />
          <div
            className="fixed z-40 bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl px-1 py-2"
            style={{ top: popup.y, left: popup.x, width: 252 }}
          >
            <div className="flex justify-around">
              <button
                onClick={() => {
                  addAnchor(popup.date, popup.slot, { block_type: popup.slot as BlockType, kind: 'healthy', name: 'ヘルシー', calories: 400, emoji: '🥗', is_want: false })
                  setPopup(null)
                }}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl active:bg-stone-800 min-w-[44px]"
              >
                <span className="text-xl">🥗</span>
                <span className="text-[9px] text-stone-400">ヘルシー</span>
              </button>
              <button
                onClick={() => {
                  addAnchor(popup.date, popup.slot, { block_type: popup.slot as BlockType, kind: 'healthy', name: 'ノーマル', calories: 600, emoji: '🍱', is_want: false })
                  setPopup(null)
                }}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl active:bg-stone-800 min-w-[44px]"
              >
                <span className="text-xl">🍱</span>
                <span className="text-[9px] text-stone-400">ノーマル</span>
              </button>
              <button
                onClick={() => { setSheet({ date: popup.date, slot: popup.slot, initialMode: 'junk' }); setPopup(null) }}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl active:bg-stone-800 min-w-[44px]"
              >
                <span className="text-xl">🍔</span>
                <span className="text-[9px] text-amber-400">ジャンキー</span>
              </button>
              <button
                onClick={() => {
                  addAnchor(popup.date, popup.slot, { block_type: popup.slot as BlockType, kind: 'skip', name: '食べない', calories: 0, emoji: '🚫', is_want: false })
                  setPopup(null)
                }}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl active:bg-stone-800 min-w-[44px]"
              >
                <span className="text-xl">⏭</span>
                <span className="text-[9px] text-stone-400">食べない</span>
              </button>
              <button
                onClick={() => { setSheet({ date: popup.date, slot: popup.slot }); setPopup(null) }}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl active:bg-stone-800 min-w-[44px]"
              >
                <span className="text-xl">✏️</span>
                <span className="text-[9px] text-stone-400">詳細を選ぶ</span>
              </button>
            </div>
            {popup.slot === 'meal_drinks' && (() => {
              const dr = getDrinksDefault()
              return (
                <button
                  onClick={() => { addAnchor(popup.date, popup.slot, dr); setPopup(null) }}
                  className="w-full mt-1.5 flex items-center justify-center gap-2 bg-amber-400/15 border border-amber-400/30 text-amber-400 rounded-xl px-3 py-1.5 text-xs font-medium"
                >
                  <span>{dr.emoji}</span>
                  <span>{dr.name}</span>
                  <span className="text-[10px] text-stone-500 ml-auto">{dr.calories}kcal ★</span>
                </button>
              )
            })()}
          </div>
        </>
      )}

      {/* ── ボトムシート ── */}
      {sheet && (
        <BottomSheet
          date={sheet.date}
          slot={sheet.slot}
          initialMode={sheet.initialMode}
          existing={cellBlocks(sheet.date, sheet.slot)}
          readOnlyAi={step === 'preview'}
          onClose={() => setSheet(null)}
          onAdd={partial => {
            addAnchor(sheet.date, sheet.slot, partial)
            if (sheet.slot !== 'exercise') setSheet(null)
          }}
          onClear={() => { clearSlot(sheet.date, sheet.slot); setSheet(null) }}
          onRemove={id => removeAnchor(id)}
        />
      )}

      {/* ── リセット確認 ── */}
      {showResetConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setShowResetConfirm(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-stone-900 rounded-t-3xl p-6 animate-slide-up">
            <div className="w-10 h-1 bg-stone-700 rounded-full mx-auto mb-5" />
            <p className="font-bold text-center text-base mb-2">週のプランをリセット</p>
            <p className="text-stone-400 text-sm text-center mb-6">
              {weekStart.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}〜の週のプランを全て削除しますか？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 border border-stone-700 text-stone-400 py-3 rounded-2xl"
              >
                キャンセル
              </button>
              <button
                onClick={resetWeek}
                className="flex-1 bg-rose-500 text-white font-bold py-3 rounded-2xl"
              >
                削除する
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── ヘルパー ────────────────────────────────────────────────

function aggregateWantItems(anchors: Anchor[]) {
  return anchors
    .filter(a => a.is_want && a.kind === 'want')
    .reduce<Array<{ name: string; count: number; calories: number; emoji?: string }>>((acc, a) => {
      const ex = acc.find(x => x.name === a.name)
      if (ex) ex.count += 1
      else acc.push({ name: a.name, count: 1, calories: a.calories, emoji: a.emoji })
      return acc
    }, [])
}

// ── サブコンポーネント ───────────────────────────────────────

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

function BottomSheet({
  date,
  slot,
  existing,
  readOnlyAi,
  onClose,
  onAdd,
  onClear,
  onRemove,
  initialMode = null,
}: {
  date: string
  slot: Slot
  existing: Anchor[]
  readOnlyAi: boolean
  onClose: () => void
  onAdd: (partial: Omit<Anchor, 'id' | 'date' | 'slot' | 'source'>) => void
  onClear: () => void
  onRemove: (id: string) => void
  initialMode?: SheetMode
}) {
  type MealCategoryFilter = 'all' | 'healthy' | 'normal' | 'junk'

  // ── 食事2ステップフロー ──
  const [mealStep, setMealStep]         = useState<'main' | 'set'>('main')
  const [categoryFilter, setCategoryFilter] = useState<MealCategoryFilter>(
    initialMode === 'junk'    ? 'junk'    :
    initialMode === 'healthy' ? 'healthy' :
    initialMode === 'normal'  ? 'normal'  : 'all'
  )
  const [selectedMain, setSelectedMain]   = useState<MainTemplate | null>(null)
  const [expandedMain, setExpandedMain]   = useState<string | null>(null)
  const [selectedSet,  setSelectedSet]    = useState<typeof SET_OPTIONS[number] | null>(null)

  // ── 運動・メモモード ──
  const [exerciseMode, setExerciseMode] = useState(false)
  const [noteMode,     setNoteMode]     = useState(false)
  const [noteText,     setNoteText]     = useState('')

  // ── フリー入力 ──
  const [showFree, setShowFree] = useState(false)
  const [freeName, setFreeName] = useState('')
  const [freeCals, setFreeCals] = useState('')

  const slotMeta   = SLOTS.find(s => s.key === slot)!
  const isExercise = slot === 'exercise'
  const dayLabel   = new Date(date).toLocaleDateString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
  })
  const baseBlockType: BlockType = isExercise ? 'exercise_cardio' : (slot as BlockType)

  const filteredMains = categoryFilter === 'all'
    ? MAIN_TEMPLATES
    : MAIN_TEMPLATES.filter(m => m.category === categoryFilter)

  function confirmMeal(setOpt: typeof SET_OPTIONS[number]) {
    if (!selectedMain) return
    const name     = setOpt.id === 'none'
      ? selectedMain.name
      : `${selectedMain.name}＋${setOpt.label}`
    const calories = selectedMain.calories + setOpt.extraCalories
    onAdd({
      block_type: baseBlockType,
      kind:       selectedMain.is_want ? 'want' : 'healthy',
      name, calories,
      emoji:   selectedMain.emoji,
      is_want: selectedMain.is_want,
    })
  }

  function pickExercise(p: typeof EXERCISE_PRESETS[number]) {
    onAdd({
      block_type: p.block_type, kind: 'exercise',
      name: p.name, calories: p.calories, duration_min: p.duration_min,
      emoji: p.emoji, is_want: false,
    })
  }

  function pickSkip() {
    onAdd({ block_type: baseBlockType, kind: 'skip', name: '食べない', calories: 0, emoji: '🚫', is_want: false })
  }

  function pickNote() {
    if (!noteText.trim()) return
    onAdd({ block_type: baseBlockType, kind: 'note', name: noteText.trim(), calories: 0, emoji: '📝', is_want: false })
  }

  function submitFree() {
    const n = freeName.trim()
    const c = parseInt(freeCals)
    if (!n || !c) return
    onAdd({ block_type: baseBlockType, kind: 'healthy', name: n, calories: c, emoji: '🍱', is_want: false })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-stone-900 rounded-t-3xl pt-3 pb-8 px-5 max-h-[85vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-stone-700 rounded-full mx-auto mb-4" />
        <p className="text-stone-500 text-xs">{dayLabel}</p>
        <h3 className="text-lg font-bold mb-4 mt-0.5">
          {slotMeta.emoji} {slotMeta.label} に何を置く？
        </h3>

        {/* ── 配置済みアイテム ── */}
        {existing.length > 0 && (
          <div className="mb-5 space-y-2">
            <p className="text-stone-500 text-xs">配置済み</p>
            {existing.map(b => (
              <div
                key={b.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                  b.is_want ? 'bg-amber-400/15 border border-amber-400/30' : 'bg-stone-800'
                }`}
              >
                <span className="truncate">
                  {b.emoji} {b.name}
                  {b.duration_min ? ` · ${b.duration_min}分` : ''}
                  {b.calories ? ` · ${b.calories}kcal` : ''}
                  {b.is_want ? ' ★' : ''}
                  {b.source === 'ai' ? ' (AI)' : ''}
                </span>
                {(b.source === 'user' || !readOnlyAi) && (
                  <button onClick={() => onRemove(b.id)} className="text-rose-400 text-xs ml-2 shrink-0">
                    削除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ════════ 運動フロー ════════ */}
        {isExercise && !exerciseMode && (
          <div className="space-y-2">
            <button
              onClick={() => setExerciseMode(true)}
              className="w-full flex items-center justify-between bg-stone-800 text-stone-200 rounded-2xl px-4 py-3 text-sm font-medium"
            >
              <span>🏃 運動を選ぶ</span>
              <span className="text-stone-500 text-lg">›</span>
            </button>
            <button onClick={onClear} className="w-full border border-stone-700 text-stone-500 py-2 rounded-2xl text-xs">
              このスロットを空白に戻す
            </button>
          </div>
        )}
        {isExercise && exerciseMode && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {EXERCISE_PRESETS.map(p => (
                <button
                  key={p.name}
                  onClick={() => pickExercise(p)}
                  className="bg-stone-800 rounded-2xl px-3 py-3 text-left"
                >
                  <div className="text-xl leading-none">{p.emoji}</div>
                  <div className="text-sm font-medium mt-1 text-stone-100">{p.name}</div>
                  <div className="text-stone-500 text-[10px]">{p.duration_min}分 · {p.calories}kcal</div>
                </button>
              ))}
            </div>
            <button onClick={() => setExerciseMode(false)} className="w-full mt-4 text-stone-500 text-sm">
              ← 戻る
            </button>
          </>
        )}

        {/* ════════ 食事：STEP1 メインを選ぶ ════════ */}
        {!isExercise && !noteMode && mealStep === 'main' && (
          <>
            {/* カテゴリタブ */}
            <div className="flex gap-1.5 mb-4">
              {([
                { id: 'all'     as const, label: '全て',       emoji: '' },
                { id: 'healthy' as const, label: 'ヘルシー',   emoji: '🥗' },
                { id: 'normal'  as const, label: 'ノーマル',   emoji: '🍱' },
                { id: 'junk'    as const, label: 'ジャンキー', emoji: '🍔' },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                    categoryFilter === tab.id
                      ? tab.id === 'junk'
                        ? 'bg-amber-400 text-stone-950'
                        : tab.id === 'healthy'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-stone-500 text-stone-100'
                      : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {tab.emoji ? `${tab.emoji} ` : ''}{tab.label}
                </button>
              ))}
            </div>

            {/* メニューカード一覧 */}
            <div className="space-y-2 mb-4">
              {filteredMains.map(m => (
                <div
                  key={m.name}
                  className={`rounded-2xl overflow-hidden ${
                    m.is_want
                      ? 'bg-amber-400/10 border border-amber-400/30'
                      : 'bg-stone-800'
                  }`}
                >
                  <div className="flex items-center px-4 py-3">
                    <span className="text-2xl mr-3 leading-none">{m.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold truncate ${
                        m.is_want ? 'text-amber-300' : 'text-stone-100'
                      }`}>
                        {m.name}{m.is_want ? ' ★' : ''}
                      </div>
                      <div className="text-[11px] text-stone-500">{m.calories}kcal</div>
                    </div>
                    {/* 詳細トグル */}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setExpandedMain(expandedMain === m.name ? null : m.name)
                      }}
                      className="text-stone-500 text-base px-2 py-1 shrink-0"
                      aria-label="詳細を見る"
                    >
                      {expandedMain === m.name ? '∨' : '›'}
                    </button>
                    {/* 選ぶボタン */}
                    <button
                      onClick={() => { setSelectedMain(m); setMealStep('set'); setExpandedMain(null) }}
                      className={`ml-1 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 ${
                        m.is_want
                          ? 'bg-amber-400 text-stone-950'
                          : 'bg-stone-600 text-stone-100'
                      }`}
                    >
                      選ぶ
                    </button>
                  </div>
                  {/* 詳細展開 */}
                  {expandedMain === m.name && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-stone-400 bg-stone-900 rounded-xl px-3 py-2 leading-relaxed">
                        {m.description}
                        <br />
                        <span className="text-stone-600">カロリー目安: {m.calories}kcal（メインのみ）</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {/* フリー入力 */}
              {!showFree ? (
                <button
                  onClick={() => setShowFree(true)}
                  className="w-full bg-stone-800 rounded-2xl px-4 py-3 text-left text-sm text-stone-400"
                >
                  ✏️ フリー入力
                </button>
              ) : (
                <div className="bg-stone-800 rounded-2xl px-4 py-3 space-y-2">
                  <input
                    type="text"
                    value={freeName}
                    onChange={e => setFreeName(e.target.value)}
                    placeholder="食事名"
                    className="w-full bg-stone-700 rounded-xl px-3 py-2 text-sm placeholder-stone-600 focus:outline-none"
                  />
                  <input
                    type="number"
                    value={freeCals}
                    onChange={e => setFreeCals(e.target.value)}
                    placeholder="カロリー（kcal）"
                    className="w-full bg-stone-700 rounded-xl px-3 py-2 text-sm placeholder-stone-600 focus:outline-none"
                  />
                  <button
                    onClick={submitFree}
                    disabled={!freeName.trim() || !freeCals}
                    className="w-full bg-stone-600 text-stone-100 font-bold py-2 rounded-xl text-sm disabled:opacity-50"
                  >
                    確定
                  </button>
                </div>
              )}
            </div>

            {/* 食べない / メモ / クリア */}
            <div className="space-y-2 border-t border-stone-800 pt-3">
              <button
                onClick={pickSkip}
                className="w-full flex items-center justify-center bg-stone-900 border border-dashed border-stone-700 text-stone-500 rounded-2xl px-4 py-2.5 text-sm"
              >
                ⏭ 食べない
              </button>
              <button
                onClick={() => setNoteMode(true)}
                className="w-full bg-stone-800/60 text-stone-400 py-2 rounded-2xl text-sm"
              >
                📝 予定メモ
              </button>
              <button
                onClick={onClear}
                className="w-full border border-stone-700 text-stone-500 py-2 rounded-2xl text-xs"
              >
                このスロットを空白に戻す
              </button>
            </div>
          </>
        )}

        {/* ════════ 食事：STEP2 セットを選ぶ ════════ */}
        {!isExercise && !noteMode && mealStep === 'set' && selectedMain && (
          <>
            {/* 選択済みメイン */}
            <div className={`flex items-center rounded-2xl px-4 py-3 mb-5 ${
              selectedMain.is_want
                ? 'bg-amber-400/15 border border-amber-400/30'
                : 'bg-stone-800'
            }`}>
              <span className="text-2xl mr-3 leading-none">{selectedMain.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold truncate ${
                  selectedMain.is_want ? 'text-amber-300' : 'text-stone-100'
                }`}>
                  {selectedMain.name}{selectedMain.is_want ? ' ★' : ''}
                </div>
                <div className="text-[11px] text-stone-500">{selectedMain.calories}kcal</div>
              </div>
              <button
                onClick={() => { setMealStep('main'); setSelectedMain(null); setSelectedSet(null) }}
                className="text-stone-500 text-xs px-2 shrink-0"
              >
                変更
              </button>
            </div>

            <p className="text-stone-400 text-xs font-medium mb-3">セットを選ぶ</p>

            {/* セットオプション */}
            <div className="space-y-2 mb-5">
              {SET_OPTIONS.map(opt => {
                const total      = selectedMain.calories + opt.extraCalories
                const isSelected = selectedSet?.id === opt.id
                const isJunkSet  = opt.id === 'junk'
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedSet(opt)}
                    className={`w-full flex items-center px-4 py-3 rounded-2xl text-left transition-colors ${
                      isSelected
                        ? isJunkSet
                          ? 'bg-amber-400/30 border-2 border-amber-400'
                          : 'bg-stone-700 border-2 border-stone-500'
                        : isJunkSet
                          ? 'bg-amber-400/10 border border-amber-400/30'
                          : 'bg-stone-800 border border-transparent'
                    }`}
                  >
                    <span className="text-xl mr-3 leading-none shrink-0">{opt.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${isJunkSet ? 'text-amber-300' : 'text-stone-200'}`}>
                        {opt.label}{isJunkSet ? ' ★' : ''}
                      </div>
                      <div className="text-[11px] text-stone-500">{opt.description}</div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {opt.extraCalories > 0 && (
                        <div className="text-[10px] text-stone-500">+{opt.extraCalories}</div>
                      )}
                      <div className={`text-sm font-bold tabular-nums ${
                        isJunkSet ? 'text-amber-400' : 'text-stone-300'
                      }`}>
                        {total.toLocaleString()}
                        <span className="text-[10px] font-normal text-stone-500 ml-0.5">kcal</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* 合計カロリー表示 */}
            {selectedSet && (
              <div className={`rounded-2xl px-4 py-3 mb-4 text-center ${
                selectedMain.is_want
                  ? 'bg-amber-400/15 border border-amber-400/30'
                  : 'bg-stone-800'
              }`}>
                <p className="text-stone-500 text-xs mb-1">合計カロリー</p>
                <p className={`text-2xl font-bold tabular-nums ${
                  selectedMain.is_want ? 'text-amber-400' : 'text-stone-100'
                }`}>
                  {(selectedMain.calories + selectedSet.extraCalories).toLocaleString()}
                  <span className="text-sm font-normal text-stone-500 ml-1">kcal</span>
                  {selectedMain.is_want && <span className="ml-1 text-amber-400">★</span>}
                </p>
                {selectedSet.extraCalories > 0 && (
                  <p className="text-stone-600 text-xs mt-1">
                    {selectedMain.calories} + {selectedSet.extraCalories} = {selectedMain.calories + selectedSet.extraCalories}
                  </p>
                )}
              </div>
            )}

            {/* 決定ボタン */}
            <button
              onClick={() => selectedSet && confirmMeal(selectedSet)}
              disabled={!selectedSet}
              className={`w-full font-bold py-4 rounded-2xl text-base disabled:opacity-40 ${
                selectedMain.is_want
                  ? 'bg-amber-400 text-stone-950'
                  : 'bg-stone-600 text-stone-100'
              }`}
            >
              決定する{selectedMain.is_want ? ' ★' : ''}
            </button>

            <button
              onClick={() => { setMealStep('main'); setSelectedMain(null); setSelectedSet(null) }}
              className="w-full mt-3 text-stone-500 text-sm"
            >
              ← メインの選択に戻る
            </button>
          </>
        )}

        {/* ════════ 予定メモモード ════════ */}
        {!isExercise && noteMode && (
          <div className="space-y-3">
            <input
              type="text"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="例: 会食、出張、外食予定など"
              className="w-full bg-stone-800 rounded-2xl px-4 py-3 text-sm placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
            />
            <button
              onClick={pickNote}
              disabled={!noteText.trim()}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3 rounded-2xl text-sm disabled:opacity-50"
            >
              このスロットにメモを置く
            </button>
            <button onClick={() => setNoteMode(false)} className="w-full mt-1 text-stone-500 text-sm">
              ← 戻る
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
