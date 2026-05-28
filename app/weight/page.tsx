'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { WeightLog } from '@/types'

export default function WeightPage() {
  const router = useRouter()
  const [weights, setWeights] = useState<WeightLog[]>([])
  const [newWeight, setNewWeight] = useState('')
  const [newWaist, setNewWaist] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCheckin, setShowCheckin] = useState(false)

  // 体重変化なし時のチェックイン
  const [feelBodyChange, setFeelBodyChange] = useState<boolean | null>(null)
  const [planAdherence, setPlanAdherence] = useState<'perfect' | 'mostly' | 'some_deviation' | null>(null)
  const [aiMessage, setAiMessage] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => { loadWeights() }, [])

  async function loadWeights() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('measured_at', { ascending: false })
      .limit(10)
    setWeights(data || [])
  }

  async function saveWeight() {
    if (!newWeight) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const latestWeight = weights[0]?.weight_kg
    const currentWeight = parseFloat(newWeight)
    const noChange = latestWeight && Math.abs(currentWeight - latestWeight) < 0.3

    await supabase.from('weight_logs').insert({
      user_id: user.id,
      weight_kg: currentWeight,
      waist_cm: newWaist ? parseFloat(newWaist) : null,
      measured_at: new Date().toISOString().split('T')[0],
    })

    await loadWeights()
    setNewWeight('')
    setNewWaist('')
    setSaving(false)

    // 体重変化なしの場合はチェックインへ
    if (noChange && weights.length >= 2) {
      setShowCheckin(true)
    }
  }

  async function runCheckin() {
    if (feelBodyChange === null || !planAdherence) return
    setChecking(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('user_profiles').select('*').eq('id', user.id).single()

    const res = await fetch('/api/ai-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkinData: {
          weight_changed: false,
          feel_body_change: feelBodyChange,
          plan_adherence: planAdherence,
        },
        recentWeights: weights.slice(0, 4),
        userProfile: profile || {},
      }),
    })
    const data = await res.json()
    setAiMessage(data.message || '')
    setChecking(false)
  }

  const latestWeight = weights[0]?.weight_kg
  const prevWeight = weights[1]?.weight_kg
  const weightDiff = latestWeight && prevWeight ? (latestWeight - prevWeight).toFixed(1) : null

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24">
      <div className="max-w-md mx-auto">
      <header className="px-5 pt-12 pb-6">
        <h1 className="text-xl font-bold">体重記録</h1>
        <p className="text-stone-500 text-xs mt-1">週1回・同じ条件で測ろう</p>
      </header>

      <main className="px-5 space-y-6">
        {/* 最新体重 */}
        {latestWeight && (
          <div className="bg-stone-900 rounded-3xl p-6 text-center">
            <p className="text-stone-500 text-sm mb-2">現在の体重</p>
            <p className="text-5xl font-bold text-amber-400">{latestWeight}<span className="text-xl text-stone-500 ml-1">kg</span></p>
            {weightDiff && (
              <p className={`text-sm mt-2 ${parseFloat(weightDiff) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                前回比 {parseFloat(weightDiff) > 0 ? '+' : ''}{weightDiff}kg
              </p>
            )}
          </div>
        )}

        {/* 体重入力 */}
        <div className="bg-stone-900 rounded-3xl p-5 space-y-4">
          <h2 className="font-bold text-sm">今日の体重を記録</h2>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.1"
              value={newWeight}
              onChange={e => setNewWeight(e.target.value)}
              placeholder="00.0"
              className="flex-1 bg-stone-800 rounded-2xl px-4 py-3 text-2xl font-bold text-center text-amber-400 placeholder-stone-700 focus:outline-none"
            />
            <span className="text-stone-500">kg</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.5"
              value={newWaist}
              onChange={e => setNewWaist(e.target.value)}
              placeholder="ウエスト（任意）"
              className="flex-1 bg-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-300 placeholder-stone-700 focus:outline-none"
            />
            <span className="text-stone-500">cm</span>
          </div>

          <button
            onClick={saveWeight}
            disabled={!newWeight || saving}
            className="w-full bg-amber-400 text-stone-950 font-bold py-3 rounded-2xl disabled:opacity-30"
          >
            {saving ? '保存中...' : '記録する'}
          </button>
        </div>

        {/* 体重変化なしチェックイン */}
        {showCheckin && !aiMessage && (
          <div className="bg-amber-400/10 border border-amber-400/30 rounded-3xl p-5 space-y-5">
            <p className="text-amber-400 font-bold">体重があまり変わっていないね 🤔</p>
            <p className="text-stone-400 text-sm">ちょっと聞かせて。一緒に確認しよう！</p>

            <div>
              <p className="text-stone-300 text-sm font-medium mb-3">体調や見た目に変化を感じる？</p>
              <div className="flex gap-2">
                {[
                  { value: true, label: '感じる' },
                  { value: false, label: '特になし' },
                ].map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setFeelBodyChange(opt.value)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium ${
                      feelBodyChange === opt.value ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-stone-300 text-sm font-medium mb-3">今週の計画、どのくらい守れた？</p>
              <div className="space-y-2">
                {[
                  { value: 'perfect', label: 'ほぼ完璧' },
                  { value: 'mostly', label: 'だいたい' },
                  { value: 'some_deviation', label: 'ちょっとズレた' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPlanAdherence(opt.value as any)}
                    className={`w-full py-2 rounded-xl text-sm ${
                      planAdherence === opt.value ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={runCheckin}
              disabled={feelBodyChange === null || !planAdherence || checking}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3 rounded-2xl disabled:opacity-30"
            >
              {checking ? 'AIが考え中...' : 'アドバイスをもらう'}
            </button>
          </div>
        )}

        {/* AIアドバイス */}
        {aiMessage && (
          <div className="bg-stone-900 rounded-3xl p-5">
            <p className="text-amber-400 font-bold mb-2">AIコーチより</p>
            <p className="text-stone-300 text-sm leading-relaxed">{aiMessage}</p>
          </div>
        )}

        {/* 体重履歴 */}
        {weights.length > 0 && (
          <div className="bg-stone-900 rounded-3xl p-5">
            <h2 className="font-bold text-sm mb-4">記録履歴</h2>
            <div className="space-y-3">
              {weights.slice(0, 8).map((w, i) => (
                <div key={w.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-stone-400 text-xs">{w.measured_at}</p>
                    {w.waist_cm && <p className="text-stone-600 text-xs">ウエスト {w.waist_cm}cm</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {i > 0 && (() => {
                      const diff = (w.weight_kg - weights[i - 1]?.weight_kg)
                      if (Math.abs(diff) < 0.1) return null
                      return (
                        <span className={`text-xs ${diff > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                        </span>
                      )
                    })()}
                    <span className="font-bold text-amber-400">{w.weight_kg}kg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      </div>

      {/* ボトムナビ */}
      <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800 px-8 py-4 flex justify-around">
        <NavItem label="今日" emoji="🏠" onClick={() => router.push('/')} />
        <NavItem label="週プラン" emoji="📅" onClick={() => router.push('/plan')} />
        <NavItem label="体重" emoji="⚖️" active />
        <NavItem label="設定" emoji="⚙️" onClick={() => router.push('/settings')} />
      </nav>
    </div>
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
