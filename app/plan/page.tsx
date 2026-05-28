'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  CalorieBuffer, PlanBlock, WeekPlan,
  BLOCK_LABELS, MEAL_TYPES, EXERCISE_TYPES, BlockType, BlockStatus,
} from '@/types'
import { getWeekStart, formatDate, getWeekDates, getDayLabel, toBeerCount, toRamenCount } from '@/lib/calories'

const MEAL_ORDER: BlockType[] = ['meal_morning', 'meal_lunch', 'meal_snack', 'meal_dinner', 'meal_drinks']
const EXERCISE_ORDER: BlockType[] = ['exercise_weights', 'exercise_cardio', 'exercise_sport']

// バッファを使うオプション
const BUFFER_USE_OPTIONS = [
  { label: 'ラーメンを追加',     emoji: '🍜', kcal: 800 },
  { label: 'ビール2本分を追加',  emoji: '🍺', kcal: 400 },
  { label: 'チートデーメシ',     emoji: '🍔', kcal: 500 },
  { label: 'スイーツを追加',     emoji: '🍰', kcal: 300 },
]

// 変更ボトムシート用
interface TemplateItem {
  id: string
  name: string
  calories: number
  emoji: string
  is_want: boolean
  category: 'healthy' | 'normal' | 'junk'
  description: string
}

const SET_OPTIONS = [
  { id: 'none'    as const, label: 'セットなし',       description: 'メインのみ',                     extraCalories: 0,   emoji: '—'  },
  { id: 'healthy' as const, label: 'ヘルシーセット',   description: 'サラダ or 味噌汁',               extraCalories: 100, emoji: '🥗' },
  { id: 'normal'  as const, label: 'ノーマルセット',   description: 'ご飯＋味噌汁＋小鉢',             extraCalories: 300, emoji: '🍱' },
  { id: 'junk'    as const, label: 'ジャンキーセット', description: '餃子 or ライス大盛り or 揚げ物', extraCalories: 400, emoji: '🍔' },
]

export default function PlanPage() {
  const router = useRouter()
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [blocks, setBlocks] = useState<PlanBlock[]>([])
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // ユーザー情報
  const [userId, setUserId] = useState<string | null>(null)
  const [userBaseCalories, setUserBaseCalories] = useState<number>(2200)

  // バッファ
  const [buffer, setBuffer] = useState<CalorieBuffer | null>(null)
  const [useBufferSheet, setUseBufferSheet] = useState(false)

  // 変更ボトムシート
  const [changeSheet, setChangeSheet] = useState<PlanBlock | null>(null)

  // 変更後のリプランプロンプト（バッファで吸収しきれなかった場合のみ）
  const [postChange, setPostChange] = useState<{ block: PlanBlock; delta: number } | null>(null)
  const [replanLoading, setReplanLoading] = useState(false)
  const [replanMessage, setReplanMessage] = useState<string | null>(null)

  const weekStart = getWeekStart()
  const weekDates = getWeekDates(weekStart)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('user_profiles').select('base_calories').eq('id', user.id).single()
    if (profile) setUserBaseCalories(profile.base_calories)

    const { data: plan } = await supabase
      .from('week_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start', formatDate(weekStart))
      .single()

    if (plan) {
      setWeekPlan(plan)
      const [{ data: b }, { data: buf }] = await Promise.all([
        supabase.from('plan_blocks').select('*').eq('week_plan_id', plan.id).order('sort_order'),
        supabase.from('calorie_buffers').select('*').eq('week_plan_id', plan.id).maybeSingle(),
      ])
      setBlocks(b || [])
      setBuffer(buf ?? null)
    }
    setLoading(false)
  }

  // ──────────────────────────────────────────────────
  // バッファ操作
  // ──────────────────────────────────────────────────

  async function doUpsertBuffer(newTotal: number) {
    if (!weekPlan || !userId) return
    const next: CalorieBuffer = buffer
      ? { ...buffer, total_buffer: newTotal, updated_at: new Date().toISOString() }
      : { id: '', user_id: userId, week_plan_id: weekPlan.id, total_buffer: newTotal, updated_at: new Date().toISOString() }
    setBuffer(next)

    if (buffer?.id) {
      await supabase.from('calorie_buffers')
        .update({ total_buffer: newTotal, updated_at: new Date().toISOString() })
        .eq('id', buffer.id)
    } else {
      const { data } = await supabase.from('calorie_buffers')
        .insert({ user_id: userId, week_plan_id: weekPlan.id, total_buffer: newTotal })
        .select().single()
      if (data) setBuffer(data as CalorieBuffer)
    }
  }

  // ──────────────────────────────────────────────────
  // ブロック操作
  // ──────────────────────────────────────────────────

  async function updateBlockStatus(block: PlanBlock, status: BlockStatus) {
    const isExercise = (EXERCISE_TYPES as string[]).includes(block.block_type)
    setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, status } : b))
    await supabase.from('plan_blocks').update({ status }).eq('id', block.id)

    // 運動ブロックを完了/取り消した場合のみバッファ更新
    // actual_calories が未設定（applyChange 未使用）の場合のみ
    if (isExercise && block.actual_calories == null) {
      if (status === 'done' && block.status !== 'done') {
        await doUpsertBuffer((buffer?.total_buffer ?? 0) + block.calories)
        const beer  = toBeerCount(block.calories)
        const ramen = toRamenCount(block.calories)
        const reward = ramen > 0 ? `ラーメン${ramen}杯分` : beer > 0 ? `ビール${beer}本分` : `${block.calories}kcal分`
        setToast(`🏦 ${block.name}完了！${reward}メシ貯めに追加！`)
        setTimeout(() => setToast(null), 5000)
      } else if (status === 'planned' && block.status === 'done') {
        await doUpsertBuffer((buffer?.total_buffer ?? 0) - block.calories)
      }
    }
  }

  async function applyChange(
    block: PlanBlock,
    actualName: string,
    actualCalories: number,
    newStatus: BlockStatus,
  ) {
    const isExercise = (EXERCISE_TYPES as string[]).includes(block.block_type)
    // 食事: delta = actual - planned  (正=食べすぎ)
    // 運動: delta = planned - actual  (正=サボり)
    const delta = isExercise
      ? (block.calories || 0) - actualCalories
      : actualCalories - (block.calories || 0)

    const updated = { ...block, actual_name: actualName, actual_calories: actualCalories, status: newStatus }
    setBlocks(prev => prev.map(b => b.id === block.id ? updated : b))
    await supabase.from('plan_blocks').update({
      actual_name: actualName,
      actual_calories: actualCalories,
      status: newStatus,
    }).eq('id', block.id)

    setChangeSheet(null)

    if (delta === 0) return

    const currentBuffer = buffer?.total_buffer ?? 0
    const newBufferTotal = currentBuffer - delta   // delta<0 → 増加, delta>0 → 減少

    await doUpsertBuffer(newBufferTotal)

    if (delta < 0) {
      // 余裕が生まれた → バッファに自動積立
      setToast(`🏦 ${Math.abs(delta)}kcalをメシ貯めに追加！`)
      setTimeout(() => setToast(null), 4000)
    } else {
      // オーバー
      if (newBufferTotal >= 0) {
        // バッファで吸収できた
        setToast(`🏦 バッファから${delta}kcal充当しました`)
        setTimeout(() => setToast(null), 4000)
      } else {
        // バッファでは吸収しきれない → リプランプロンプト
        setPostChange({ block: updated, delta: Math.abs(newBufferTotal) })
      }
    }
  }

  // バッファを使って食事追加へ
  async function useBufferFor(kcal: number) {
    const newTotal = (buffer?.total_buffer ?? 0) - kcal
    await doUpsertBuffer(newTotal)
    setUseBufferSheet(false)
    router.push('/plan/new')
  }

  // AIリプラン実行（postChange の delta を使用）
  async function callReplan() {
    if (!postChange || !weekPlan || !userId) return
    setReplanLoading(true)

    const today = formatDate(new Date())
    const { data: remainingBlocks } = await supabase
      .from('plan_blocks').select('*')
      .eq('week_plan_id', weekPlan.id).gte('plan_date', today).order('plan_date')

    const res = await fetch('/api/replan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviation: {
          deviation_type: 'ate_more',
          description: `${postChange.block.name}を変更 (${postChange.block.actual_name})`,
          calorie_delta: postChange.delta,
        },
        remainingBlocks: remainingBlocks || [],
        userProfile: { base_calories: userBaseCalories },
      }),
    })

    if (!res.ok) { setReplanLoading(false); return }
    const data = await res.json()

    if (data.updated_blocks?.length > 0) {
      for (const b of data.updated_blocks) {
        if (b.id) await supabase.from('plan_blocks')
          .update({ name: b.name, calories: b.calories, duration_min: b.duration_min }).eq('id', b.id)
      }
    }
    if (data.added_blocks?.length > 0) {
      await supabase.from('plan_blocks').insert(
        data.added_blocks.map((b: any, i: number) => ({
          week_plan_id: weekPlan.id, user_id: userId,
          plan_date: b.plan_date, block_type: b.block_type,
          name: b.name, calories: b.calories, duration_min: b.duration_min ?? null,
          is_want: false, is_ai_generated: true, is_flexible: true,
          sort_order: 100 + i, status: 'planned',
        }))
      )
    }

    setReplanLoading(false)
    setReplanMessage(data.message || 'プランを更新しました！')
    loadData()
  }

  // ──────────────────────────────────────────────────
  // 派生値
  // ──────────────────────────────────────────────────

  const selectedBlocks = blocks.filter(b => b.plan_date === selectedDate)

  const mealBlocks = MEAL_ORDER
    .map(type => ({ type, blocks: selectedBlocks.filter(b => b.block_type === type) }))
    .filter(g => g.blocks.length > 0)

  const exerciseBlocks = EXERCISE_ORDER
    .map(type => ({ type, blocks: selectedBlocks.filter(b => b.block_type === type) }))
    .filter(g => g.blocks.length > 0)

  const dayHasWant = (date: string) =>
    blocks.some(b => b.plan_date === date && b.is_want)

  const weekExerciseBurned = blocks
    .filter(b => b.status === 'done' && (EXERCISE_TYPES as string[]).includes(b.block_type))
    .reduce((s, b) => s + (b.calories || 0), 0)

  // バッファ表示用
  const bufferTotal = buffer?.total_buffer ?? 0
  const bufferBeer  = toBeerCount(Math.abs(bufferTotal))
  const bufferRamen = toRamenCount(Math.abs(bufferTotal))

  const bufferEquivText = (() => {
    const n = Math.abs(bufferTotal)
    const r = toRamenCount(n)
    const b = toBeerCount(n)
    const parts: string[] = []
    if (r > 0) parts.push(`ラーメン${r}杯分`)
    if (b > 0) parts.push(`ビール${b}本分`)
    return parts.length > 0 ? parts.join('・') : `${n}kcal分`
  })()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="text-amber-400">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24">
      <div className="max-w-md mx-auto">
      <header className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">週間プラン</h1>
          <button
            onClick={() => router.push('/plan/new')}
            className="bg-amber-400/20 text-amber-400 text-xs font-bold px-3 py-1.5 rounded-xl"
          >
            来週を宣言
          </button>
        </div>
        {weekPlan?.ai_summary && (
          <p className="text-stone-500 text-xs mt-2 leading-relaxed">{weekPlan.ai_summary}</p>
        )}
      </header>

      {/* ─── メシ貯めバッファ ─── */}
      {weekPlan && (
        <div className="px-5 mb-3">
          {bufferTotal > 0 ? (
            <div className="bg-amber-400/10 border border-amber-400/20 rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-400 text-xs font-semibold mb-0.5">🏦 今週のメシ貯め</p>
                  <p className="text-2xl font-bold text-amber-400">+{bufferTotal.toLocaleString()} kcal</p>
                  <p className="text-stone-500 text-xs mt-0.5">（{bufferEquivText}）</p>
                </div>
                <button
                  onClick={() => setUseBufferSheet(true)}
                  className="bg-amber-400 text-stone-950 text-xs font-bold px-3 py-2 rounded-xl"
                >
                  使う →
                </button>
              </div>
            </div>
          ) : bufferTotal < 0 ? (
            <div className="bg-rose-400/10 border border-rose-400/20 rounded-2xl px-4 py-3">
              <p className="text-rose-400 text-xs font-semibold mb-0.5">⚠️ メシ貯め赤字</p>
              <p className="text-xl font-bold text-rose-400">{bufferTotal.toLocaleString()} kcal</p>
              <p className="text-stone-500 text-xs mt-1">運動か食事で調整しよう</p>
              <button
                onClick={() => router.push('/log/deviation')}
                className="mt-2 text-xs bg-rose-400/20 text-rose-400 px-3 py-1.5 rounded-xl"
              >
                AIにリプランしてもらう
              </button>
            </div>
          ) : (
            <div className="bg-stone-900 rounded-2xl px-4 py-3">
              <p className="text-stone-500 text-xs font-semibold mb-0.5">🏦 今週のメシ貯め</p>
              <p className="text-stone-600 text-sm">まだ貯まっていません。ヘルシー食や運動で貯めよう！</p>
            </div>
          )}
        </div>
      )}

      {/* 今週の運動で稼いだ分（バッファ外の完了運動） */}
      {weekPlan && weekExerciseBurned > 0 && bufferTotal === 0 && (
        <div className="px-5 mb-3">
          <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-2xl px-4 py-3">
            <p className="text-emerald-400 text-xs font-semibold mb-1.5">今週の運動で稼いだ分</p>
            <div className="flex gap-4 text-sm text-stone-300">
              {toBeerCount(weekExerciseBurned) > 0  && <span>🍺 ビール{toBeerCount(weekExerciseBurned)}本分</span>}
              {toRamenCount(weekExerciseBurned) > 0 && <span>🍜 ラーメン{toRamenCount(weekExerciseBurned)}杯分</span>}
              {toBeerCount(weekExerciseBurned) === 0 && toRamenCount(weekExerciseBurned) === 0 && (
                <span className="text-stone-500">{weekExerciseBurned}kcal分</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 曜日タブ */}
      <div className="px-5 mb-6">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {weekDates.map(date => {
            const isSelected = date === selectedDate
            const isToday = date === formatDate(new Date())
            const hasWant = dayHasWant(date)
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center px-3 py-2 rounded-2xl min-w-[44px] transition-all ${
                  isSelected ? 'bg-amber-400 text-stone-950' : 'bg-stone-900 text-stone-400'
                }`}
              >
                <span className="text-xs">{getDayLabel(date)}</span>
                <span className={`text-base font-bold ${isToday && !isSelected ? 'text-amber-400' : ''}`}>
                  {new Date(date).getDate()}
                </span>
                {hasWant && <span className="text-[8px] mt-0.5">★</span>}
              </button>
            )
          })}
        </div>
      </div>

      {!weekPlan ? (
        <div className="px-5">
          <div className="bg-stone-900 rounded-3xl p-8 text-center">
            <p className="text-4xl mb-4">🍜</p>
            <p className="text-stone-400 text-sm mb-6">今週のプランがまだありません</p>
            <button
              onClick={() => router.push('/plan/new')}
              className="bg-amber-400 text-stone-950 font-bold px-8 py-3 rounded-2xl"
            >
              欲望を宣言する
            </button>
          </div>
        </div>
      ) : (
        <main className="px-5 space-y-5">
          {/* 食事ブロック */}
          {mealBlocks.length > 0 && (
            <section>
              <h2 className="text-stone-500 text-xs font-semibold uppercase tracking-widest mb-3">食事</h2>
              <div className="space-y-3">
                {mealBlocks.map(({ type, blocks }) => (
                  <div key={type}>
                    <p className="text-stone-600 text-xs mb-1.5 ml-1">{BLOCK_LABELS[type]}</p>
                    <div className="space-y-2">
                      {blocks.map(block => (
                        <PlanBlockCard
                          key={block.id}
                          block={block}
                          onDone={() => updateBlockStatus(block, 'done')}
                          onSkip={() => updateBlockStatus(block, 'skipped')}
                          onUndo={() => updateBlockStatus(block, 'planned')}
                          onChangePress={() => setChangeSheet(block)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 運動ブロック */}
          {exerciseBlocks.length > 0 && (
            <section>
              <h2 className="text-stone-500 text-xs font-semibold uppercase tracking-widest mb-3">運動</h2>
              <div className="space-y-2">
                {exerciseBlocks.map(({ type, blocks }) => (
                  <div key={type}>
                    <p className="text-stone-600 text-xs mb-1.5 ml-1">{BLOCK_LABELS[type]}</p>
                    <div className="space-y-2">
                      {blocks.map(block => (
                        <PlanBlockCard
                          key={block.id}
                          block={block}
                          onDone={() => updateBlockStatus(block, 'done')}
                          onSkip={() => updateBlockStatus(block, 'skipped')}
                          onUndo={() => updateBlockStatus(block, 'planned')}
                          onChangePress={() => setChangeSheet(block)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {selectedBlocks.length === 0 && (
            <div className="text-center py-12 text-stone-600 text-sm">
              この日のプランはまだありません
            </div>
          )}
        </main>
      )}

      </div>

      {/* トースト */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50
          bg-emerald-400 text-stone-950 font-bold text-sm
          px-5 py-3 rounded-2xl shadow-lg animate-slide-up whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* バッファを使うボトムシート */}
      {useBufferSheet && (
        <div className="fixed inset-0 z-50" onClick={() => setUseBufferSheet(false)}>
          <div className="absolute inset-0 bg-stone-950/80" />
          <div
            className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-stone-900 rounded-t-3xl px-5 pt-4 pb-10 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-8 h-1 bg-stone-700 rounded-full mx-auto mb-5" />
            <p className="text-stone-400 text-sm mb-1">何に使う？</p>
            <p className="text-amber-400 text-xs mb-4">残り {bufferTotal.toLocaleString()}kcal</p>
            <div className="space-y-2">
              {BUFFER_USE_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  onClick={() => useBufferFor(opt.kcal)}
                  className="w-full flex items-center justify-between px-4 py-3.5 bg-stone-800 rounded-2xl"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{opt.emoji}</span>
                    <span className="text-sm text-stone-200">{opt.label}</span>
                  </div>
                  <span className="text-stone-500 text-xs">{opt.kcal}kcal</span>
                </button>
              ))}
              <button
                onClick={() => { setUseBufferSheet(false); router.push('/plan/new') }}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-stone-800 rounded-2xl"
              >
                <span className="text-xl">📅</span>
                <span className="text-sm text-stone-200">自分でプランに追加する</span>
              </button>
              <button
                onClick={() => setUseBufferSheet(false)}
                className="w-full text-stone-600 text-sm py-3"
              >
                → まだ使わない
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 変更ボトムシート */}
      {changeSheet && (
        <ChangeSheet
          block={changeSheet}
          onClose={() => setChangeSheet(null)}
          onApply={(name, cal, status) => applyChange(changeSheet, name, cal, status)}
        />
      )}

      {/* バッファ不足時リプランオーバーレイ */}
      {postChange && (
        <div className="fixed inset-0 z-50 bg-stone-950/98 flex flex-col overflow-y-auto">
          <div className="max-w-md mx-auto w-full px-5 pt-16 pb-10">

            {replanMessage ? (
              <div className="space-y-6">
                <div className="bg-stone-900 rounded-3xl p-6">
                  <p className="text-2xl mb-3">🔄</p>
                  <p className="text-amber-400 font-bold mb-2">プランを更新したよ！</p>
                  <p className="text-stone-300 text-sm leading-relaxed">{replanMessage}</p>
                </div>
                <button
                  onClick={() => { setPostChange(null); setReplanMessage(null) }}
                  className="w-full bg-amber-400 text-stone-950 font-bold py-4 rounded-2xl"
                >
                  更新されたプランを見る →
                </button>
              </div>
            ) : replanLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <p className="text-amber-400 text-base">AIがプランを調整中...</p>
                <p className="text-stone-600 text-xs">欲望ブロックは守るよ</p>
              </div>
            ) : (
              <>
                <p className="text-lg font-bold mb-1">
                  {postChange.block.actual_name || postChange.block.name}に変えた
                </p>
                <p className="text-rose-400 font-bold text-base mb-2">
                  +{postChange.delta}kcal バッファでは吸収しきれない
                </p>
                <p className="text-stone-500 text-xs mb-6">
                  メシ貯めを使い切っても{postChange.delta}kcal足りません
                </p>
                <p className="text-stone-400 text-sm mb-4">どうする？</p>
                <div className="space-y-2">
                  <ReplanOption emoji="💪" label="運動を増やして帳消し"
                    onClick={() => { setPostChange(null); router.push('/plan/new') }} />
                  <ReplanOption emoji="🥗" label="明日の食事を軽めにする"
                    onClick={() => { setPostChange(null); router.push('/plan/new') }} />
                  <ReplanOption emoji="📅" label="AIに残りを自動調整してもらう"
                    onClick={callReplan} />
                </div>
                <button
                  onClick={() => setPostChange(null)}
                  className="w-full mt-4 text-stone-500 text-sm py-3"
                >
                  → 今は何もしない
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ボトムナビ */}
      <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800 px-8 py-4 flex justify-around">
        <NavItem label="今日" emoji="🏠" onClick={() => router.push('/')} />
        <NavItem label="週プラン" emoji="📅" active />
        <NavItem label="体重" emoji="⚖️" onClick={() => router.push('/weight')} />
        <NavItem label="設定" emoji="⚙️" onClick={() => router.push('/settings')} />
      </nav>
    </div>
  )
}

function PlanBlockCard({
  block, onDone, onSkip, onUndo, onChangePress,
}: {
  block: PlanBlock
  onDone: () => void
  onSkip: () => void
  onUndo: () => void
  onChangePress: () => void
}) {
  const isExercise = (EXERCISE_TYPES as string[]).includes(block.block_type)
  const isDone     = block.status === 'done'
  const isSkipped  = block.status === 'skipped'
  const isModified = block.status === 'modified'
  const hasChanged = isModified && !!block.actual_name

  const displayName     = block.actual_name || block.name
  const displayCalories = block.actual_calories ?? block.calories

  return (
    <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${
      block.is_want ? 'bg-amber-400/10 border border-amber-400/30' : 'bg-stone-900'
    } ${isDone ? 'opacity-60' : ''}`}>
      {block.is_want && <span className="text-amber-400 text-xs font-bold">★</span>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-stone-500' : 'text-stone-100'}`}>
            {displayName}
          </p>
          {hasChanged && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-400 shrink-0 font-medium">
              変更済
            </span>
          )}
        </div>
        {hasChanged && (
          <p className="text-[10px] text-stone-600 mt-0.5 truncate">元の計画：{block.name}</p>
        )}
        <p className="text-stone-600 text-xs mt-0.5">
          {isExercise
            ? `消費 ${displayCalories}kcal${block.duration_min ? ` · ${block.duration_min}分` : ''}`
            : `${displayCalories}kcal`}
        </p>
      </div>
      <div className="flex gap-1.5 items-center shrink-0">
        {isDone ? (
          <button onClick={onUndo} className="text-xs px-2 py-1 rounded-lg bg-emerald-400/20 text-emerald-400">
            ✅ 完了
          </button>
        ) : isSkipped ? (
          <button onClick={onUndo} className="text-xs px-2 py-1 rounded-lg bg-stone-800 text-stone-500">
            ⏭ スキップ
          </button>
        ) : isModified ? (
          <span className="text-xs px-2 py-1 rounded-lg bg-amber-400/20 text-amber-400">変更済</span>
        ) : (
          <>
            <button onClick={onSkip} className="text-xs px-2 py-1 rounded-lg bg-stone-800 text-stone-400">⏭</button>
            <button onClick={onDone} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-400/20 text-emerald-400 font-medium">✅ 完了</button>
          </>
        )}
        <button onClick={onChangePress} className="text-xs px-2 py-1 rounded-lg bg-stone-800 text-stone-500">
          変更
        </button>
      </div>
    </div>
  )
}

function ChangeOption({ emoji, label, onClick, accent }: {
  emoji: string; label: string; onClick: () => void; accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left ${
        accent
          ? 'bg-amber-400/15 border border-amber-400/30'
          : 'bg-stone-800'
      }`}
    >
      <span className="text-xl w-7 text-center">{emoji}</span>
      <span className={`text-sm ${accent ? 'text-amber-300 font-medium' : 'text-stone-200'}`}>{label}</span>
      {accent && <span className="ml-auto text-amber-400 text-xs">★</span>}
    </button>
  )
}

// ── 変更ボトムシート（3ステップ）──────────────────────────

function ChangeSheet({
  block,
  onClose,
  onApply,
}: {
  block: PlanBlock
  onClose: () => void
  onApply: (name: string, calories: number, status: BlockStatus) => void
}) {
  type CategoryFilter = 'all' | 'healthy' | 'normal' | 'junk'
  type Step = 'options' | 'menu' | 'set'

  const [step,           setStep]           = useState<Step>('options')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [templates,      setTemplates]      = useState<TemplateItem[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedMain,   setSelectedMain]   = useState<TemplateItem | null>(null)
  const [selectedSet,    setSelectedSet]    = useState<typeof SET_OPTIONS[number] | null>(null)
  const [expandedId,     setExpandedId]     = useState<string | null>(null)

  // 運動の自由入力
  const [editName,     setEditName]     = useState(block.actual_name || block.name)
  const [editCalories, setEditCalories] = useState(String(block.actual_calories ?? block.calories))

  const isExercise = (EXERCISE_TYPES as string[]).includes(block.block_type)

  // カテゴリ判定（metadataがない場合はカロリーで推定）
  function deriveCategory(
    calories: number,
    metadata: { category?: string } | null | undefined,
  ): 'healthy' | 'normal' | 'junk' {
    const cat = metadata?.category
    if (cat === 'healthy' || cat === 'normal' || cat === 'junk') return cat
    if (calories < 400) return 'healthy'
    if (calories < 700) return 'normal'
    return 'junk'
  }

  // Supabase から block_templates を取得
  async function loadTemplates() {
    setTemplatesLoading(true)
    const { data } = await supabase
      .from('block_templates')
      .select('*')
      .is('user_id', null)
      .in('block_type', ['meal_morning', 'meal_lunch', 'meal_snack', 'meal_dinner'])
      .order('calories', { ascending: true })

    const items: TemplateItem[] = (data || []).map((t: any) => ({
      id:          t.id,
      name:        t.name,
      calories:    t.calories || 0,
      emoji:       t.emoji || '🍽',
      is_want:     t.is_want || false,
      category:    deriveCategory(t.calories || 0, t.metadata as any),
      description: (t.metadata as any)?.description || '',
    }))
    setTemplates(items)
    setTemplatesLoading(false)
  }

  // STEP2へ遷移（カテゴリをプリセット）
  function goToMenu(filter: CategoryFilter) {
    setCategoryFilter(filter)
    setSelectedMain(null)
    setSelectedSet(null)
    setExpandedId(null)
    if (templates.length === 0) loadTemplates()
    setStep('menu')
  }

  const filteredTemplates = categoryFilter === 'all'
    ? templates
    : templates.filter(t => t.category === categoryFilter)

  // STEP3で「記録する」
  function confirmChange() {
    if (!selectedMain || !selectedSet) return
    const name = selectedSet.id === 'none'
      ? selectedMain.name
      : `${selectedMain.name}＋${selectedSet.label}`
    onApply(name, selectedMain.calories + selectedSet.extraCalories, 'modified')
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-stone-950/80" />
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-stone-900 rounded-t-3xl px-5 pt-4 pb-10 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-8 h-1 bg-stone-700 rounded-full mx-auto mb-5" />

        {/* ヘッダー */}
        <div className="mb-4">
          <p className="text-stone-500 text-xs mb-0.5">変更を記録する</p>
          <p className="text-stone-300 text-sm font-medium truncate">
            {block.actual_name || block.name}
          </p>
        </div>

        {/* ════════ STEP1: 何が変わった？ ════════ */}
        {step === 'options' && (isExercise ? (
          <div className="space-y-2">
            <ChangeOption emoji="💪" label="もっとやった（延長）"
              onClick={() => onApply(block.name + '（延長）', (block.calories || 0) + 200, 'modified')} />
            <ChangeOption emoji="⬇️" label="少なめにした"
              onClick={() => onApply(block.name + '（軽め）', Math.round((block.calories || 0) * 0.7), 'modified')} />
            <ChangeOption emoji="✕" label="やらなかった"
              onClick={() => onApply(block.name, 0, 'skipped')} />
            <ChangeOption emoji="✏️" label="詳細を入力する"
              onClick={() => setStep('menu')} />
          </div>
        ) : (
          <div className="space-y-2">
            <ChangeOption emoji="🥗" label="ヘルシーに変えた"
              onClick={() => goToMenu('healthy')} />
            <ChangeOption emoji="🍱" label="ノーマルに変えた"
              onClick={() => goToMenu('normal')} />
            <ChangeOption emoji="🍔" label="ジャンキーに食べた"
              accent onClick={() => goToMenu('junk')} />
            <ChangeOption emoji="⏭" label="食べなかった"
              onClick={() => onApply(block.name, 0, 'skipped')} />
            <ChangeOption emoji="✏️" label="内容を変更する"
              onClick={() => goToMenu('all')} />
          </div>
        ))}

        {/* ════════ STEP2: メニューを選ぶ（食事） ════════ */}
        {step === 'menu' && !isExercise && (
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
                      ? tab.id === 'junk'    ? 'bg-amber-400 text-stone-950'
                        : tab.id === 'healthy' ? 'bg-emerald-500 text-white'
                        : 'bg-stone-500 text-stone-100'
                      : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {tab.emoji ? `${tab.emoji} ` : ''}{tab.label}
                </button>
              ))}
            </div>

            {templatesLoading ? (
              <p className="text-stone-500 text-sm text-center py-10">読み込み中...</p>
            ) : filteredTemplates.length === 0 ? (
              <p className="text-stone-600 text-sm text-center py-10">テンプレートがありません</p>
            ) : (
              <div className="space-y-2 mb-4">
                {filteredTemplates.map(t => (
                  <div
                    key={t.id}
                    className={`rounded-2xl overflow-hidden ${
                      t.is_want ? 'bg-amber-400/10 border border-amber-400/30' : 'bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center px-4 py-3">
                      <span className="text-2xl mr-3 leading-none">{t.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-bold truncate ${t.is_want ? 'text-amber-300' : 'text-stone-100'}`}>
                          {t.name}{t.is_want ? ' ★' : ''}
                        </div>
                        <div className="text-[11px] text-stone-500">{t.calories}kcal</div>
                      </div>
                      {/* 詳細トグル */}
                      {t.description && (
                        <button
                          onClick={e => { e.stopPropagation(); setExpandedId(expandedId === t.id ? null : t.id) }}
                          className="text-stone-500 text-base px-2 py-1 shrink-0"
                          aria-label="詳細を見る"
                        >
                          {expandedId === t.id ? '∨' : '›'}
                        </button>
                      )}
                      {/* 選ぶボタン */}
                      <button
                        onClick={() => { setSelectedMain(t); setSelectedSet(null); setStep('set') }}
                        className={`ml-1 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 ${
                          t.is_want ? 'bg-amber-400 text-stone-950' : 'bg-stone-600 text-stone-100'
                        }`}
                      >
                        選ぶ
                      </button>
                    </div>
                    {expandedId === t.id && (
                      <div className="px-4 pb-3">
                        <p className="text-xs text-stone-400 bg-stone-900 rounded-xl px-3 py-2 leading-relaxed">
                          {t.description}
                          <br />
                          <span className="text-stone-600">カロリー目安: {t.calories}kcal</span>
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setStep('options')}
              className="w-full mt-2 text-stone-500 text-sm py-2"
            >
              ← 戻る
            </button>
          </>
        )}

        {/* ════════ STEP2: 自由入力（運動） ════════ */}
        {step === 'menu' && isExercise && (
          <div className="space-y-3">
            <div>
              <p className="text-stone-500 text-xs mb-1.5">名前</p>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-stone-800 rounded-xl px-4 py-3 text-sm text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
              />
            </div>
            <div>
              <p className="text-stone-500 text-xs mb-1.5">カロリー (kcal)</p>
              <input
                type="number"
                value={editCalories}
                onChange={e => setEditCalories(e.target.value)}
                className="w-full bg-stone-800 rounded-xl px-4 py-3 text-sm text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
              />
            </div>
            <button
              onClick={() => onApply(editName, Number(editCalories) || 0, 'modified')}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3 rounded-2xl"
            >
              保存
            </button>
            <button
              onClick={() => setStep('options')}
              className="w-full text-stone-500 text-sm py-2"
            >
              ← 戻る
            </button>
          </div>
        )}

        {/* ════════ STEP3: セットを選ぶ ════════ */}
        {step === 'set' && selectedMain && (
          <>
            {/* 選択済みメイン */}
            <div className={`flex items-center rounded-2xl px-4 py-3 mb-5 ${
              selectedMain.is_want ? 'bg-amber-400/15 border border-amber-400/30' : 'bg-stone-800'
            }`}>
              <span className="text-2xl mr-3 leading-none">{selectedMain.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold truncate ${selectedMain.is_want ? 'text-amber-300' : 'text-stone-100'}`}>
                  {selectedMain.name}{selectedMain.is_want ? ' ★' : ''}
                </div>
                <div className="text-[11px] text-stone-500">{selectedMain.calories}kcal</div>
              </div>
              <button
                onClick={() => { setStep('menu'); setSelectedSet(null) }}
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
                      <div className={`text-sm font-bold tabular-nums ${isJunkSet ? 'text-amber-400' : 'text-stone-300'}`}>
                        {total.toLocaleString()}
                        <span className="text-[10px] font-normal text-stone-500 ml-0.5">kcal</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* 合計カロリー */}
            {selectedSet && (
              <div className={`rounded-2xl px-4 py-3 mb-4 text-center ${
                selectedMain.is_want ? 'bg-amber-400/15 border border-amber-400/30' : 'bg-stone-800'
              }`}>
                <p className="text-stone-500 text-xs mb-1">合計カロリー</p>
                <p className={`text-2xl font-bold tabular-nums ${selectedMain.is_want ? 'text-amber-400' : 'text-stone-100'}`}>
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

            {/* 記録するボタン */}
            <button
              onClick={confirmChange}
              disabled={!selectedSet}
              className={`w-full font-bold py-4 rounded-2xl text-base disabled:opacity-40 ${
                selectedMain.is_want ? 'bg-amber-400 text-stone-950' : 'bg-stone-600 text-stone-100'
              }`}
            >
              記録する{selectedMain.is_want ? ' ★' : ''}
            </button>

            <button
              onClick={() => { setStep('menu'); setSelectedSet(null) }}
              className="w-full mt-3 text-stone-500 text-sm py-2"
            >
              ← メインの選択に戻る
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ReplanOption({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-4 py-4 bg-stone-900 rounded-2xl text-left">
      <span className="text-xl w-7 text-center">{emoji}</span>
      <span className="text-sm text-stone-200">{label}</span>
    </button>
  )
}

function NavItem({ label, emoji, active, onClick }: {
  label: string; emoji: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1">
      <span className="text-xl">{emoji}</span>
      <span className={`text-xs ${active ? 'text-amber-400' : 'text-stone-600'}`}>{label}</span>
    </button>
  )
}
