'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DeviationType, PlanBlock, BlockType, MEAL_TYPES, EXERCISE_TYPES } from '@/types'
import { formatDate, getWeekStart } from '@/lib/calories'

const DEVIATION_OPTIONS: { type: DeviationType; label: string; emoji: string; delta: number }[] = [
  { type: 'ate_more', label: '予定より多く食べた', emoji: '🍽', delta: 300 },
  { type: 'ate_less', label: '予定より少なく食べた', emoji: '🥗', delta: -200 },
  { type: 'skipped_exercise', label: '運動をサボった', emoji: '😅', delta: 300 },
  { type: 'extra_exercise', label: '予定外に運動した', emoji: '💪', delta: -300 },
  { type: 'extra_snack', label: '計画外のおやつを食べた', emoji: '🍫', delta: 200 },
  { type: 'unplanned_meal', label: '計画外の食事があった', emoji: '🍜', delta: 500 },
]

export default function DeviationPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<typeof DEVIATION_OPTIONS[0] | null>(null)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [replanning, setReplanning] = useState(false)
  const [replanMessage, setReplanMessage] = useState('')
  const [exerciseNote, setExerciseNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [todayBlocks, setTodayBlocks] = useState<PlanBlock[]>([])

  const today = formatDate(new Date())

  useEffect(() => {
    loadTodayBlocks()
  }, [])

  async function loadTodayBlocks() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: blocks } = await supabase
      .from('plan_blocks')
      .select('*')
      .eq('user_id', user.id)
      .eq('plan_date', today)
    setTodayBlocks(blocks || [])
  }

  async function saveDeviation() {
    if (!selected) return
    setError(null)
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const weekStart = formatDate(getWeekStart())
    const { data: plan } = await supabase
      .from('week_plans').select('id').eq('user_id', user.id).eq('week_start', weekStart).single()

    if (!plan) {
      setSaving(false)
      setError('今週のプランが見つかりませんでした。先にプランを作成してください。')
      return
    }

    // ズレを記録
    const { error: insertError } = await supabase.from('deviations').insert({
      week_plan_id: plan.id,
      user_id: user.id,
      deviation_date: formatDate(new Date()),
      deviation_type: selected.type,
      description,
      calorie_delta: selected.delta,
    })

    if (insertError) {
      setSaving(false)
      setError('記録の保存に失敗しました: ' + insertError.message)
      return
    }

    // リプラン実行
    setReplanning(true)
    setSaving(false)

    const { data: remainingBlocks } = await supabase
      .from('plan_blocks')
      .select('*')
      .eq('week_plan_id', plan.id)
      .gte('plan_date', today)
      .order('plan_date')

    const { data: profile } = await supabase
      .from('user_profiles').select('*').eq('id', user.id).single()

    const res = await fetch('/api/replan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviation: { deviation_type: selected.type, description, calorie_delta: selected.delta },
        remainingBlocks: remainingBlocks || [],
        userProfile: profile || { base_calories: 2200 },
      }),
    })

    if (!res.ok) {
      setReplanning(false)
      const errData = await res.json().catch(() => ({}))
      setError(errData.error || 'AIリプランに失敗しました。しばらく経ってから再試行してください。')
      return
    }

    const data = await res.json()

    // 更新されたブロックをDBに反映
    if (data.updated_blocks?.length > 0) {
      for (const b of data.updated_blocks) {
        if (b.id) {
          await supabase.from('plan_blocks').update({
            name: b.name,
            calories: b.calories,
            duration_min: b.duration_min,
          }).eq('id', b.id)
        }
      }
    }

    // 新規追加の運動ブロックをDBに挿入
    if (data.added_blocks?.length > 0) {
      const newRows = (data.added_blocks as Array<{
        plan_date: string
        block_type: string
        name: string
        calories: number
        duration_min?: number
        emoji?: string
      }>).map((b, i) => ({
        week_plan_id: plan.id,
        user_id: user.id,
        plan_date: b.plan_date,
        block_type: b.block_type,
        name: b.name,
        calories: b.calories,
        duration_min: b.duration_min ?? null,
        is_want: false,
        is_ai_generated: true,
        is_flexible: true,
        sort_order: 100 + i,
        status: 'planned',
      }))
      await supabase.from('plan_blocks').insert(newRows)
    }

    setExerciseNote(data.exercise_note || '')
    setReplanMessage(data.message || 'プランを更新しました！')
    setReplanning(false)
  }

  const caloriesIn = todayBlocks
    .filter(b => MEAL_TYPES.includes(b.block_type as BlockType))
    .reduce((sum, b) => sum + (b.calories || 0), 0)
  const caloriesBurned = todayBlocks
    .filter(b => EXERCISE_TYPES.includes(b.block_type as BlockType))
    .reduce((sum, b) => sum + (b.calories || 0), 0)
  const net = caloriesIn - caloriesBurned

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      <div className="max-w-md mx-auto">
      <header className="px-5 pt-12 pb-6 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-stone-500 text-xl">←</button>
        <h1 className="text-xl font-bold">予定と違うことがあった</h1>
      </header>

      <main className="px-5 space-y-6">
        {/* 今日のカロリーサマリ */}
        {todayBlocks.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-stone-900 rounded-2xl p-3 text-center">
              <p className="text-stone-500 text-xs mb-1">摂取</p>
              <p className="text-lg font-bold text-rose-400">{caloriesIn}</p>
              <p className="text-stone-600 text-xs">kcal</p>
            </div>
            <div className="bg-stone-900 rounded-2xl p-3 text-center">
              <p className="text-stone-500 text-xs mb-1">消費</p>
              <p className="text-lg font-bold text-emerald-400">{caloriesBurned}</p>
              <p className="text-stone-600 text-xs">kcal</p>
            </div>
            <div className="bg-stone-900 rounded-2xl p-3 text-center">
              <p className="text-stone-500 text-xs mb-1">差引</p>
              <p className={`text-lg font-bold ${net > 2500 ? 'text-rose-400' : 'text-amber-400'}`}>{net}</p>
              <p className="text-stone-600 text-xs">kcal</p>
            </div>
          </div>
        )}

        {!replanMessage ? (
          <>
            <p className="text-stone-400 text-sm">何があった？AIが残りの週を調整するよ</p>

            <div className="space-y-2">
              {DEVIATION_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setSelected(opt)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all ${
                    selected?.type === opt.type
                      ? 'bg-amber-400/20 border border-amber-400/50'
                      : 'bg-stone-900'
                  }`}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-sm">{opt.label}</span>
                </button>
              ))}
            </div>

            {selected && (
              <div>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="詳しく教えてくれると助かる（任意）"
                  className="w-full bg-stone-900 rounded-2xl p-4 text-sm text-stone-300 placeholder:text-stone-600 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
                />
              </div>
            )}

            {error && (
              <p className="text-rose-400 text-sm bg-rose-400/10 rounded-2xl px-4 py-3">{error}</p>
            )}

            <button
              onClick={saveDeviation}
              disabled={!selected || saving || replanning}
              className="w-full bg-amber-400 text-stone-950 font-bold py-4 rounded-2xl disabled:opacity-30"
            >
              {saving ? '記録中...' : replanning ? 'AIがリプラン中...' : 'リプランしてもらう'}
            </button>
          </>
        ) : (
          <div className="space-y-6">
            <div className="bg-stone-900 rounded-3xl p-6">
              <p className="text-2xl mb-3">🔄</p>
              <p className="text-amber-400 font-bold mb-2">プランを更新したよ！</p>
              <p className="text-stone-300 text-sm leading-relaxed">{replanMessage}</p>
              {exerciseNote && (
                <div className="mt-3 bg-emerald-400/10 border border-emerald-400/30 rounded-2xl px-4 py-3">
                  <p className="text-emerald-400 text-sm font-medium">💪 {exerciseNote}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => router.push('/plan')}
              className="w-full bg-amber-400 text-stone-950 font-bold py-4 rounded-2xl"
            >
              更新されたプランを見る →
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full border border-stone-700 text-stone-400 py-3 rounded-2xl text-sm"
            >
              今日のブロックに戻る
            </button>
          </div>
        )}
      </main>
      </div>
    </div>
  )
}
