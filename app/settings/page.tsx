'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { describeReducePaceError, saveReducePace, useReducePace } from '@/lib/reducePace'
import { calcPaceKgPerMonth } from '@/lib/calories'
import { REDUCE_PACE_LABELS, REDUCE_PACE_ORDER, type ReducePace } from '@/types'

export default function SettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { pace, error: loadError, setPace } = useReducePace(userId)
  const [saving, setSaving] = useState<ReducePace | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
    })
  }, [router])

  async function choosePace(next: ReducePace) {
    if (!userId || next === pace) return
    setSaving(next)
    setSaveError(null)
    try {
      await saveReducePace(userId, next)
      setPace(next)
    } catch (e) {
      setSaveError(describeReducePaceError(e))
    }
    setSaving(null)
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24">
      <div className="max-w-md mx-auto">
        <header className="px-5 pt-12 pb-6">
          <h1 className="text-xl font-bold">設定</h1>
        </header>

        <main className="px-5 space-y-3">
          {/* 減らすペース（12-3）：1日の目安 = 必要量 − この分 */}
          <section className="bg-stone-900 rounded-2xl px-4 py-4">
            <p className="text-sm font-medium text-stone-100">減らすペース</p>
            <p className="text-stone-500 text-xs mt-0.5 mb-3">
              1日の目安は、必要量からこの分を引いた量。いつものを続けるだけで、このペースで減っていきます
            </p>
            <div className="grid grid-cols-4 gap-2">
              {REDUCE_PACE_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!pace || saving !== null}
                  onClick={() => choosePace(p)}
                  className={`rounded-xl py-2.5 text-xs ${
                    pace === p ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {REDUCE_PACE_LABELS[p]}
                  <span className="block text-[10px] opacity-80 mt-0.5">
                    {p === 'keep' ? '維持' : `月${calcPaceKgPerMonth(p)}kg`}
                  </span>
                </button>
              ))}
            </div>
            {(saveError || loadError) && <p className="text-rose-400 text-xs mt-2">{saveError || loadError}</p>}
          </section>

          <button
            onClick={() => router.push('/setup')}
            className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🎯</span>
              <div className="text-left">
                <p className="text-sm font-medium text-stone-100">目標設定</p>
                <p className="text-stone-500 text-xs mt-0.5">目標体重・期間・ゲート</p>
              </div>
            </div>
            <span className="text-stone-600">›</span>
          </button>

          <button
            onClick={() => router.push('/wants')}
            className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">★</span>
              <div className="text-left">
                <p className="text-sm font-medium text-stone-100">チートの登録</p>
                <p className="text-stone-500 text-xs mt-0.5">日付指定・毎週の頻度</p>
              </div>
            </div>
            <span className="text-stone-600">›</span>
          </button>
        </main>
      </div>

      <BottomNav active="settings" />
    </div>
  )
}
