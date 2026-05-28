'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PlanBlock, WeekPlan, BLOCK_LABELS, MEAL_TYPES, EXERCISE_TYPES, BlockType } from '@/types'
import { getWeekStart, formatDate, getDayLabel, toBeerCount, toRamenCount } from '@/lib/calories'

const MEAL_ORDER: BlockType[] = ['meal_morning', 'meal_lunch', 'meal_snack', 'meal_dinner', 'meal_drinks']
const EXERCISE_ORDER: BlockType[] = ['exercise_weights', 'exercise_cardio', 'exercise_sport']

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [todayBlocks, setTodayBlocks] = useState<PlanBlock[]>([])
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [weekAllBlocks, setWeekAllBlocks] = useState<PlanBlock[]>([])
  const [userBaseCalories, setUserBaseCalories] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const today = formatDate(new Date())

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      loadData(user.id)
    })
  }, [])

  async function loadData(userId: string) {
    const weekStartDate = getWeekStart()
    const weekStart = formatDate(weekStartDate)
    const weekEnd = formatDate(new Date(weekStartDate.getTime() + 6 * 86400000))

    const [{ data: plan }, { data: blocks }, { data: allWeekBlocks }, { data: profile }] = await Promise.all([
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
      supabase.from('plan_blocks')
        .select('*')
        .eq('user_id', userId)
        .gte('plan_date', weekStart)
        .lte('plan_date', weekEnd),
      supabase.from('user_profiles')
        .select('base_calories')
        .eq('id', userId)
        .maybeSingle(),
    ])

    setWeekPlan(plan)
    setTodayBlocks(blocks || [])
    setWeekAllBlocks(allWeekBlocks || [])
    setUserBaseCalories(profile?.base_calories ?? null)
    setLoading(false)
  }

  async function markDone(blockId: string) {
    await supabase.from('plan_blocks')
      .update({ status: 'done' })
      .eq('id', blockId)
    setTodayBlocks(prev => prev.map(b => b.id === blockId ? { ...b, status: 'done' } : b))
  }

  async function markSkipped(blockId: string) {
    await supabase.from('plan_blocks')
      .update({ status: 'skipped' })
      .eq('id', blockId)
    setTodayBlocks(prev => prev.map(b => b.id === blockId ? { ...b, status: 'skipped' } : b))
  }

  const caloriesIn = todayBlocks
    .filter(b => MEAL_TYPES.includes(b.block_type as BlockType))
    .reduce((sum, b) => sum + (b.calories || 0), 0)
  const caloriesBurned = todayBlocks
    .filter(b => EXERCISE_TYPES.includes(b.block_type as BlockType))
    .reduce((sum, b) => sum + (b.calories || 0), 0)
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

  // 今週の残り余裕計算
  const weekSurplus = (() => {
    if (!weekPlan || weekAllBlocks.length === 0) return null
    const tdeeWeek = (userBaseCalories ?? 2200) * 7
    const doneCalIn = weekAllBlocks
      .filter(b => b.status === 'done' && (MEAL_TYPES as string[]).includes(b.block_type))
      .reduce((s, b) => s + (b.calories || 0), 0)
    const doneBurned = weekAllBlocks
      .filter(b => b.status === 'done' && (EXERCISE_TYPES as string[]).includes(b.block_type))
      .reduce((s, b) => s + (b.calories || 0), 0)
    const plannedCalIn = weekAllBlocks
      .filter(b => b.status === 'planned' && b.plan_date >= today && (MEAL_TYPES as string[]).includes(b.block_type))
      .reduce((s, b) => s + (b.calories || 0), 0)
    const plannedBurned = weekAllBlocks
      .filter(b => b.status === 'planned' && b.plan_date >= today && (EXERCISE_TYPES as string[]).includes(b.block_type))
      .reduce((s, b) => s + (b.calories || 0), 0)
    const forecast = (doneCalIn + plannedCalIn) - (doneBurned + plannedBurned)
    return tdeeWeek - forecast
  })()

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

        {/* 今週の残り余裕バナー */}
        {weekSurplus !== null && (() => {
          if (weekSurplus >= 300) {
            const ramen = toRamenCount(weekSurplus)
            const beer  = toBeerCount(weekSurplus)
            const parts: string[] = []
            if (ramen > 0) parts.push(`ラーメン${ramen}杯分`)
            if (beer > 0)  parts.push(`ビール${beer}本分`)
            const equiv = parts.length > 0
              ? parts.join(' or ') + ' 食べてOKです'
              : `あと${weekSurplus.toLocaleString()}kcal分食べてOKです`
            return (
              <div className="bg-amber-400/15 border border-amber-400/30 rounded-3xl p-5">
                <p className="text-amber-400 font-bold text-base mb-1">
                  🎉 今週あと約{weekSurplus.toLocaleString()}kcal余裕あり！
                </p>
                <p className="text-stone-300 text-sm mb-3">{equiv}</p>
                <button
                  onClick={() => router.push('/plan/new')}
                  className="bg-amber-400 text-stone-950 font-bold text-sm px-4 py-2 rounded-xl"
                >
                  何を食べる？
                </button>
              </div>
            )
          }
          if (weekSurplus > -300) {
            return (
              <div className="bg-stone-900 rounded-2xl px-4 py-3 flex items-center gap-2">
                <span>✅</span>
                <p className="text-stone-400 text-sm">今週はちょうどいいバランスです</p>
              </div>
            )
          }
          return (
            <div className="bg-stone-900 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span>🍜</span>
              <p className="text-stone-400 text-sm">運動でリカバリーできるよ！</p>
            </div>
          )
        })()}

        {/* カロリーサマリ */}
        {todayBlocks.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-stone-900 rounded-2xl p-4 text-center">
              <p className="text-stone-500 text-xs mb-1">摂取</p>
              <p className="text-xl font-bold text-rose-400">{caloriesIn}</p>
              <p className="text-stone-600 text-xs">kcal</p>
            </div>
            <div className="bg-stone-900 rounded-2xl p-4 text-center">
              <p className="text-stone-500 text-xs mb-1">消費</p>
              <p className="text-xl font-bold text-emerald-400">{caloriesBurned}</p>
              <p className="text-stone-600 text-xs">kcal</p>
            </div>
            <div className="bg-stone-900 rounded-2xl p-4 text-center">
              <p className="text-stone-500 text-xs mb-1">差引</p>
              <p className={`text-xl font-bold ${caloriesIn - caloriesBurned > 2500 ? 'text-rose-400' : 'text-amber-400'}`}>
                {caloriesIn - caloriesBurned}
              </p>
              <p className="text-stone-600 text-xs">kcal</p>
            </div>
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
                      onDone={() => markDone(block.id)}
                      onSkip={() => markSkipped(block.id)}
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
                      onDone={() => markDone(block.id)}
                      onSkip={() => markSkipped(block.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
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
    </div>
  )
}

function BlockCard({
  block,
  onDone,
  onSkip,
}: {
  block: PlanBlock
  onDone: () => void
  onSkip: () => void
}) {
  const isDone = block.status === 'done'
  const isSkipped = block.status === 'skipped'

  return (
    <div className={`bg-stone-900 rounded-2xl px-4 py-3 flex items-center gap-3 ${isDone ? 'opacity-50' : ''}`}>
      {block.is_want && (
        <span className="text-amber-400 text-xs font-bold">★</span>
      )}
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm ${isDone ? 'line-through text-stone-500' : 'text-stone-100'}`}>
          {block.name}
        </p>
        <p className="text-stone-600 text-xs mt-0.5">
          {EXERCISE_TYPES.includes(block.block_type as BlockType)
            ? `消費 ${block.calories}kcal${block.duration_min ? ` · ${block.duration_min}分` : ''}`
            : `${block.calories}kcal`}
        </p>
      </div>
      {!isDone && !isSkipped && (
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
