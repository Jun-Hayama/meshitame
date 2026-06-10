'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PlanBlock, WeekPlan, CalorieBuffer, BLOCK_LABELS, MEAL_TYPES, EXERCISE_TYPES, BlockType } from '@/types'
import { getWeekStart, formatDate } from '@/lib/calories'

const MEAL_ORDER: BlockType[] = ['meal_morning', 'meal_lunch', 'meal_snack', 'meal_dinner', 'meal_drinks']
const EXERCISE_ORDER: BlockType[] = ['exercise_weights', 'exercise_cardio', 'exercise_sport']

const MEAL_CATEGORIES = [
  { label: 'ヘルシー', kcal: 400 },
  { label: '普通', kcal: 600 },
  { label: '和食', kcal: 650 },
  { label: '洋食', kcal: 750 },
  { label: 'ジャンキー', kcal: 900 },
] as const

const LARGE_EXTRA = 200

const UNPLANNED_EXERCISE_OPTIONS = [
  { name: 'ウォーキング30分', block_type: 'exercise_cardio' as BlockType, calories: 150, duration_min: 30 },
  { name: 'ウォーキング60分', block_type: 'exercise_cardio' as BlockType, calories: 300, duration_min: 60 },
  { name: 'ランニング30分', block_type: 'exercise_cardio' as BlockType, calories: 300, duration_min: 30 },
  { name: '筋トレ30分', block_type: 'exercise_weights' as BlockType, calories: 200, duration_min: 30 },
  { name: '筋トレ60分', block_type: 'exercise_weights' as BlockType, calories: 350, duration_min: 60 },
] as const

const BELOW_TARGET_MESSAGES = [
  '🏃 30分歩くと +150pt だよ',
  '🥗 夜をヘルシーにすると +200pt になるよ',
] as const

type BufferWithTarget = CalorieBuffer & { target_buffer?: number }
type UnplannedStep = null | 'type' | 'meal' | 'exercise'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [todayBlocks, setTodayBlocks] = useState<PlanBlock[]>([])
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [buffer, setBuffer] = useState<BufferWithTarget | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [completingBlockId, setCompletingBlockId] = useState<string | null>(null)
  const [selectedMealKcal, setSelectedMealKcal] = useState<number | null>(null)
  const [mealExtraLarge, setMealExtraLarge] = useState(false)
  const [unplannedStep, setUnplannedStep] = useState<UnplannedStep>(null)
  const [selectedUnplannedExercise, setSelectedUnplannedExercise] = useState<number | null>(null)
  const [encourageMsg] = useState(
    () => BELOW_TARGET_MESSAGES[Math.floor(Math.random() * BELOW_TARGET_MESSAGES.length)]
  )
  const today = formatDate(new Date())

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      loadData(user.id)
    })
  }, [])

  async function loadData(userId: string) {
    const weekStart = formatDate(getWeekStart())

    const [{ data: plan }, { data: blocks }] = await Promise.all([
      supabase.from('week_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .single(),
      supabase.from('plan_blocks')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_date', today)
        .order('sort_order'),
    ])

    setWeekPlan(plan)
    setTodayBlocks(blocks || [])

    if (plan) {
      const { data: buf } = await supabase
        .from('calorie_buffers').select('*').eq('week_plan_id', plan.id).maybeSingle()
      setBuffer(buf ?? null)
    } else {
      setBuffer(null)
    }
    setLoading(false)
  }

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  async function addToBuffer(delta: number) {
    if (!weekPlan || !user) return
    const newTotal = (buffer?.total_buffer ?? 0) + delta
    const { data } = await supabase
      .from('calorie_buffers')
      .upsert(
        { user_id: user.id, week_plan_id: weekPlan.id, total_buffer: newTotal, updated_at: new Date().toISOString() },
        { onConflict: 'week_plan_id' }
      )
      .select()
      .maybeSingle()
    setBuffer(data ?? { ...(buffer as BufferWithTarget), total_buffer: newTotal })
  }

  function resetMealComplete() {
    setCompletingBlockId(null)
    setSelectedMealKcal(null)
    setMealExtraLarge(false)
  }

  function resetUnplanned() {
    setUnplannedStep(null)
    setSelectedMealKcal(null)
    setMealExtraLarge(false)
    setSelectedUnplannedExercise(null)
  }

  function handleDoneClick(block: PlanBlock) {
    resetUnplanned()
    const isExercise = (EXERCISE_TYPES as string[]).includes(block.block_type)
    if (isExercise) {
      markDone(block)
      return
    }
    setCompletingBlockId(block.id)
    setSelectedMealKcal(null)
    setMealExtraLarge(false)
  }

  async function confirmMealDone(block: PlanBlock) {
    if (selectedMealKcal === null) return
    const actual = selectedMealKcal + (mealExtraLarge ? LARGE_EXTRA : 0)
    await markDone(block, actual)
    resetMealComplete()
  }

  async function markDone(block: PlanBlock, actualCalories?: number) {
    const isExercise = (EXERCISE_TYPES as string[]).includes(block.block_type)
    const updatePayload = isExercise
      ? { status: 'done' as const }
      : { status: 'done' as const, actual_calories: actualCalories ?? block.calories }

    await supabase.from('plan_blocks').update(updatePayload).eq('id', block.id)
    setTodayBlocks(prev => prev.map(b =>
      b.id === block.id
        ? { ...b, status: 'done', actual_calories: isExercise ? b.actual_calories : (actualCalories ?? b.calories) }
        : b
    ))

    if (isExercise) {
      showToast('💪 完了！予定通り！')
    } else {
      const actual = actualCalories ?? block.calories
      const planned = block.calories
      const diff = planned - actual
      if (diff > 0) {
        await addToBuffer(diff)
        showToast(`🥗 えらい！メシポ +${diff}pt！`)
      } else if (diff < 0) {
        await addToBuffer(diff)
        showToast(`😅 食べすぎ… メシポ -${Math.abs(diff)}pt`)
      } else {
        showToast('✅ 完了！予定通り！')
      }
    }
  }

  async function markSkipped(block: PlanBlock) {
    const isExercise = (EXERCISE_TYPES as string[]).includes(block.block_type)
    await supabase.from('plan_blocks').update({ status: 'skipped' }).eq('id', block.id)
    setTodayBlocks(prev => prev.map(b => b.id === block.id ? { ...b, status: 'skipped' } : b))

    const kcal = block.calories || 0
    if (!isExercise) {
      await addToBuffer(kcal)
      showToast(`🍱 スキップ！メシポ +${kcal}ptだよ`)
    } else {
      await addToBuffer(-kcal)
      showToast(`😅 運動サボり… メシポ -${kcal}pt`)
    }
  }

  function openUnplanned() {
    resetMealComplete()
    setUnplannedStep('type')
    setSelectedMealKcal(null)
    setMealExtraLarge(false)
    setSelectedUnplannedExercise(null)
  }

  async function confirmUnplannedMeal() {
    if (!weekPlan || !user || selectedMealKcal === null) return
    const category = MEAL_CATEGORIES.find(c => c.kcal === selectedMealKcal)
    if (!category) return
    const kcal = selectedMealKcal + (mealExtraLarge ? LARGE_EXTRA : 0)
    const name = mealExtraLarge ? `${category.label}（大盛り）` : category.label

    const { data: inserted, error } = await supabase.from('plan_blocks').insert({
      week_plan_id: weekPlan.id,
      user_id: user.id,
      plan_date: today,
      block_type: 'meal_snack',
      name,
      calories: kcal,
      is_want: false,
      is_ai_generated: false,
      is_flexible: false,
      status: 'done',
      actual_calories: kcal,
      sort_order: 999,
    }).select().single()

    if (error || !inserted) return

    setTodayBlocks(prev => [...prev, inserted as PlanBlock])
    await addToBuffer(-kcal)
    showToast(`😅 予定外… メシポ -${kcal}pt`)
    resetUnplanned()
  }

  async function confirmUnplannedExercise() {
    if (!weekPlan || !user || selectedUnplannedExercise === null) return
    const option = UNPLANNED_EXERCISE_OPTIONS[selectedUnplannedExercise]

    const { data: inserted, error } = await supabase.from('plan_blocks').insert({
      week_plan_id: weekPlan.id,
      user_id: user.id,
      plan_date: today,
      block_type: option.block_type,
      name: option.name,
      calories: option.calories,
      duration_min: option.duration_min,
      is_want: false,
      is_ai_generated: false,
      is_flexible: false,
      status: 'done',
      sort_order: 999,
    }).select().single()

    if (error || !inserted) return

    setTodayBlocks(prev => [...prev, inserted as PlanBlock])
    await addToBuffer(option.calories)
    showToast(`💪 予定外に頑張った！メシポ +${option.calories}pt！`)
    resetUnplanned()
  }

  const doneCount = todayBlocks.filter(b => b.status === 'done').length
  const wantDone = todayBlocks.filter(b => b.is_want && b.status === 'done').length
  const wantTotal = todayBlocks.filter(b => b.is_want).length

  const groupedMeals = MEAL_ORDER.map(type => ({
    type,
    blocks: todayBlocks.filter(b => b.block_type === type),
  })).filter(g => g.blocks.length > 0)

  const groupedExercise = EXERCISE_ORDER.map(type => ({
    type,
    blocks: todayBlocks.filter(b => b.block_type === type),
  })).filter(g => g.blocks.length > 0)

  const bufferTotal = buffer?.total_buffer ?? 0
  const targetBuffer = buffer?.target_buffer ?? bufferTotal
  const bufferDiff = bufferTotal - targetBuffer
  const isAboveTarget = bufferDiff >= 0

  const selectedMealActual = selectedMealKcal != null
    ? selectedMealKcal + (mealExtraLarge ? LARGE_EXTRA : 0)
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="text-amber-400 text-lg">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24">
      <div className="max-w-md mx-auto">
      {/* ヘッダー */}
      <header className="px-5 pt-12 pb-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-stone-500 text-sm mb-1">
              {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-amber-400">メシ</span>ため
            </h1>
          </div>
          <div className="text-right">
            <p className="text-stone-500 text-xs">完了</p>
            <p className="text-2xl font-bold text-amber-400">{doneCount}<span className="text-stone-500 text-sm">/{todayBlocks.length}</span></p>
          </div>
        </div>

        {/* 欲望ブロック達成状況 */}
        {wantTotal > 0 && (
          <div className="mt-4 bg-amber-400/10 border border-amber-400/20 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-amber-400 font-semibold text-sm">今日の★欲望</p>
              <p className="text-stone-300 text-xs mt-0.5">
                {todayBlocks.filter(b => b.is_want).map(b => b.name).join('・')}
              </p>
            </div>
            <div className="text-amber-400 font-bold text-lg">
              {wantDone}/{wantTotal}
            </div>
          </div>
        )}
      </header>

      <main className="px-5 space-y-6">
        {/* プランがない場合 */}
        {!weekPlan && (
          <div className="bg-stone-900 rounded-3xl p-6 text-center">
            <p className="text-4xl mb-3">🍜</p>
            <p className="text-stone-400 text-sm mb-4">今週のプランがまだありません</p>
            <button
              onClick={() => router.push('/plan/new')}
              className="bg-amber-400 text-stone-950 font-bold px-6 py-3 rounded-2xl text-sm"
            >
              今週の欲望を宣言する
            </button>
          </div>
        )}

        {/* メシポバナー（常時表示・bufferがある場合のみ） */}
        {buffer && (
          <div className={`rounded-2xl px-4 py-3 border ${
            isAboveTarget
              ? 'bg-amber-400/10 border-amber-400/30'
              : 'bg-rose-950/30 border-rose-800/50'
          }`}>
            <p className={`font-bold text-sm ${isAboveTarget ? 'text-amber-400' : 'text-rose-400'}`}>
              🪙 メシポ {bufferTotal.toLocaleString()}pt
            </p>
            <p className={`text-xs mt-1 ${isAboveTarget ? 'text-amber-400/80' : 'text-rose-400/80'}`}>
              目標ライン {targetBuffer.toLocaleString()}pt{' '}
              {isAboveTarget
                ? `▲ +${bufferDiff.toLocaleString()}pt 順調！`
                : `▼ ${bufferDiff.toLocaleString()}pt 挽回しよう`}
            </p>
          </div>
        )}

        {/* 食事ブロック */}
        {groupedMeals.length > 0 && (
          <section>
            <h2 className="text-stone-500 text-xs font-semibold uppercase tracking-widest mb-3">食事</h2>
            <div className="space-y-2">
              {groupedMeals.map(({ type, blocks }) => (
                <div key={type}>
                  <p className="text-stone-600 text-xs mb-1 ml-1">{BLOCK_LABELS[type]}</p>
                  {blocks.map(block => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      isCompleting={completingBlockId === block.id}
                      selectedMealKcal={selectedMealKcal}
                      mealExtraLarge={mealExtraLarge}
                      onSelectCategory={setSelectedMealKcal}
                      onToggleExtraLarge={() => setMealExtraLarge(v => !v)}
                      onDone={() => handleDoneClick(block)}
                      onConfirmActual={() => confirmMealDone(block)}
                      onCancelComplete={resetMealComplete}
                      onSkip={() => markSkipped(block)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 運動ブロック */}
        {groupedExercise.length > 0 && (
          <section>
            <h2 className="text-stone-500 text-xs font-semibold uppercase tracking-widest mb-3">運動</h2>
            <div className="space-y-2">
              {groupedExercise.map(({ type, blocks }) => (
                <div key={type}>
                  <p className="text-stone-600 text-xs mb-1 ml-1">{BLOCK_LABELS[type]}</p>
                  {blocks.map(block => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      isCompleting={false}
                      onDone={() => handleDoneClick(block)}
                      onSkip={() => markSkipped(block)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 予定外を記録する */}
        {weekPlan && (
          <div className="space-y-3">
            {!unplannedStep && (
              <button
                type="button"
                onClick={openUnplanned}
                className="w-full border border-stone-700 text-stone-400 rounded-2xl py-3 text-sm"
              >
                ＋ 予定外を記録する
              </button>
            )}

            {unplannedStep === 'type' && (
              <div className="bg-stone-900 rounded-2xl px-4 py-3 space-y-3">
                <p className="text-stone-400 text-xs">何を記録する？</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setUnplannedStep('meal'); setSelectedMealKcal(null); setMealExtraLarge(false) }}
                    className="flex-1 bg-stone-800 text-stone-200 text-sm py-2.5 rounded-xl"
                  >
                    🍔 予定外に食べた
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUnplannedStep('exercise'); setSelectedUnplannedExercise(null) }}
                    className="flex-1 bg-stone-800 text-stone-200 text-sm py-2.5 rounded-xl"
                  >
                    🏃 予定外に運動した
                  </button>
                </div>
                <button type="button" onClick={resetUnplanned} className="text-stone-600 text-xs">
                  キャンセル
                </button>
              </div>
            )}

            {unplannedStep === 'meal' && (
              <div className="bg-stone-900 rounded-2xl px-4 py-3">
                <MealCategoryPicker
                  title="予定外に何を食べた？"
                  selectedMealKcal={selectedMealKcal}
                  mealExtraLarge={mealExtraLarge}
                  selectedActual={selectedMealActual}
                  onSelectCategory={setSelectedMealKcal}
                  onToggleExtraLarge={() => setMealExtraLarge(v => !v)}
                  onConfirm={confirmUnplannedMeal}
                  onCancel={resetUnplanned}
                />
              </div>
            )}

            {unplannedStep === 'exercise' && (
              <div className="bg-stone-900 rounded-2xl px-4 py-3 space-y-3">
                <p className="text-stone-400 text-xs">予定外に何をした？</p>
                <div className="space-y-2">
                  {UNPLANNED_EXERCISE_OPTIONS.map((opt, i) => (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => setSelectedUnplannedExercise(i)}
                      className={`w-full text-left text-xs px-3 py-2.5 rounded-xl border ${
                        selectedUnplannedExercise === i
                          ? 'bg-amber-400 text-stone-950 border-amber-400 font-bold'
                          : 'bg-stone-800 text-stone-300 border-stone-700'
                      }`}
                    >
                      {opt.name}（+{opt.calories}pt）
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmUnplannedExercise}
                    disabled={selectedUnplannedExercise === null}
                    className="flex-1 bg-amber-400 text-stone-950 text-xs font-bold py-2 rounded-xl disabled:opacity-30"
                  >
                    確定
                  </button>
                  <button
                    type="button"
                    onClick={resetUnplanned}
                    className="flex-1 border border-stone-700 text-stone-400 text-xs py-2 rounded-xl"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* メシポ促しカード */}
        {weekPlan && (
          <div className="bg-stone-900 rounded-2xl px-4 py-3">
            <p className="text-stone-400 text-sm">
              {buffer && isAboveTarget
                ? '🎉 今週は順調！このまま行こう'
                : encourageMsg}
            </p>
          </div>
        )}

        {/* ズレたボタン */}
        {todayBlocks.length > 0 && (
          <button
            onClick={() => router.push('/log/deviation')}
            className="w-full border border-stone-700 text-stone-400 rounded-2xl py-3 text-sm"
          >
            📝 予定と違うことがあった
          </button>
        )}
      </main>
      </div>

      {/* ボトムナビ */}
      <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800 px-8 py-4 flex justify-around">
        <NavItem label="今日" emoji="🏠" active onClick={() => {}} />
        <NavItem label="週プラン" emoji="📅" onClick={() => router.push('/plan')} />
        <NavItem label="体重" emoji="⚖️" onClick={() => router.push('/weight')} />
        <NavItem label="設定" emoji="⚙️" onClick={() => router.push('/settings')} />
      </nav>

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-stone-100 text-sm font-medium px-5 py-3 rounded-2xl shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

function MealCategoryPicker({
  title,
  plannedKcal,
  selectedMealKcal,
  mealExtraLarge,
  selectedActual,
  onSelectCategory,
  onToggleExtraLarge,
  onConfirm,
  onCancel,
}: {
  title: string
  plannedKcal?: number
  selectedMealKcal: number | null
  mealExtraLarge: boolean
  selectedActual: number | null
  onSelectCategory: (kcal: number) => void
  onToggleExtraLarge: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-stone-400 text-xs">
        {title}{plannedKcal != null ? `（予定: ${plannedKcal}kcal）` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {MEAL_CATEGORIES.map(cat => (
          <button
            key={cat.label}
            type="button"
            onClick={() => onSelectCategory(cat.kcal)}
            className={`text-xs px-2.5 py-1.5 rounded-xl border ${
              selectedMealKcal === cat.kcal
                ? 'bg-amber-400 text-stone-950 border-amber-400 font-bold'
                : 'bg-stone-800 text-stone-300 border-stone-700'
            }`}
          >
            {cat.label} {cat.kcal}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-stone-400 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={mealExtraLarge}
          onChange={onToggleExtraLarge}
          className="rounded border-stone-600"
        />
        大盛り (+{LARGE_EXTRA}kcal)
      </label>
      {selectedActual != null && (
        <p className="text-stone-500 text-xs">合計: {selectedActual}kcal</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={selectedMealKcal == null}
          className="flex-1 bg-amber-400 text-stone-950 text-xs font-bold py-2 rounded-xl disabled:opacity-30"
        >
          確定
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-stone-700 text-stone-400 text-xs py-2 rounded-xl"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

function BlockCard({
  block,
  isCompleting,
  selectedMealKcal,
  mealExtraLarge,
  onSelectCategory,
  onToggleExtraLarge,
  onDone,
  onConfirmActual,
  onCancelComplete,
  onSkip,
}: {
  block: PlanBlock
  isCompleting?: boolean
  selectedMealKcal?: number | null
  mealExtraLarge?: boolean
  onSelectCategory?: (kcal: number) => void
  onToggleExtraLarge?: () => void
  onDone: () => void
  onConfirmActual?: () => void
  onCancelComplete?: () => void
  onSkip: () => void
}) {
  const isDone = block.status === 'done'
  const isSkipped = block.status === 'skipped'
  const isExercise = EXERCISE_TYPES.includes(block.block_type as BlockType)
  const selectedActual = selectedMealKcal != null
    ? selectedMealKcal + (mealExtraLarge ? LARGE_EXTRA : 0)
    : null

  return (
    <div className={`bg-stone-900 rounded-2xl px-4 py-3 ${isDone ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        {block.is_want && (
          <span className="text-amber-400 text-xs font-bold">★</span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm ${isDone ? 'line-through text-stone-500' : 'text-stone-100'}`}>
            {block.name}
          </p>
          <p className="text-stone-600 text-xs mt-0.5">
            {isExercise
              ? `消費 ${block.calories}kcal${block.duration_min ? ` · ${block.duration_min}分` : ''}`
              : `${block.calories}kcal`}
          </p>
        </div>
        {!isDone && !isSkipped && !isCompleting && (
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="text-stone-600 text-xs px-2 py-1 rounded-lg"
            >
              スキップ
            </button>
            <button
              onClick={onDone}
              className="bg-amber-400 text-stone-950 text-xs font-bold px-3 py-1.5 rounded-xl"
            >
              完了
            </button>
          </div>
        )}
        {isDone && <span className="text-emerald-400 text-lg">✓</span>}
        {isSkipped && <span className="text-stone-600 text-xs">スキップ</span>}
      </div>

      {!isExercise && isCompleting && (
        <div className="mt-3 pt-3 border-t border-stone-800">
          <MealCategoryPicker
            title="何を食べた？"
            plannedKcal={block.calories}
            selectedMealKcal={selectedMealKcal ?? null}
            mealExtraLarge={mealExtraLarge ?? false}
            selectedActual={selectedActual}
            onSelectCategory={onSelectCategory!}
            onToggleExtraLarge={onToggleExtraLarge!}
            onConfirm={onConfirmActual!}
            onCancel={onCancelComplete!}
          />
        </div>
      )}
    </div>
  )
}

function NavItem({ label, emoji, active, onClick }: {
  label: string
  emoji: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1">
      <span className="text-xl">{emoji}</span>
      <span className={`text-xs ${active ? 'text-amber-400' : 'text-stone-600'}`}>{label}</span>
    </button>
  )
}
