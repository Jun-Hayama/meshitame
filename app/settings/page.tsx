'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import { describeReducePaceError, saveReducePace, useReducePace } from '@/lib/reducePace'
import { describeExercisePresetsError, saveExercisePresets, useExercisePresets } from '@/lib/exercisePresets'
import { calcPaceKgPerMonth, listExercisePresetOptions } from '@/lib/calories'
import { QUICK_EXERCISE_TYPES } from '@/lib/calorieConstants'
import {
  EXERCISE_TYPE_EMOJI,
  EXERCISE_TYPE_LABELS,
  REDUCE_PACE_LABELS,
  REDUCE_PACE_ORDER,
  type ExercisePresets,
  type QuickExerciseType,
  type ReducePace,
} from '@/types'

const PRESET_OPTIONS = listExercisePresetOptions()

export default function SettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { pace, error: loadError, setPace } = useReducePace(userId)
  const [saving, setSaving] = useState<ReducePace | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // うごための時間（18-追記 v2.8.1）：選んだらすぐ保存。失敗したら元の値に戻す
  const { presets, setPresets } = useExercisePresets(userId)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetError, setPresetError] = useState<string | null>(null)

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

  async function choosePreset(type: QuickExerciseType, minutes: number) {
    if (!userId || !presets || presets[type] === minutes) return
    const prev = presets
    const next: ExercisePresets = { ...presets, [type]: minutes }
    setPresets(next)
    setSavingPreset(true)
    setPresetError(null)
    try {
      await saveExercisePresets(userId, next)
    } catch (e) {
      setPresets(prev)
      setPresetError(describeExercisePresetsError(e))
    }
    setSavingPreset(false)
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
              1日の目安は、必要量からこの分を引いた量です。いつものを続けるだけで、このペースで減っていきそうです
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

          {/* うごための時間（18-追記 v2.8.1）：今日の画面の4つのボタンで記録する分数 */}
          <section className="bg-stone-900 rounded-2xl px-4 py-4">
            <p className="text-sm font-medium text-stone-100">うごための時間</p>
            <p className="text-stone-500 text-xs mt-0.5 mb-3">今日の画面のボタンを押したときに記録する時間です</p>
            <ul className="space-y-2">
              {QUICK_EXERCISE_TYPES.map((type) => (
                <li key={type} className="flex items-center justify-between">
                  <label htmlFor={`preset-${type}`} className="text-sm text-stone-200">
                    {EXERCISE_TYPE_EMOJI[type]} {EXERCISE_TYPE_LABELS[type]}
                  </label>
                  <select
                    id={`preset-${type}`}
                    value={presets?.[type] ?? ''}
                    disabled={!presets || savingPreset}
                    onChange={(e) => choosePreset(type, Number(e.target.value))}
                    className="bg-stone-800 text-stone-100 text-sm rounded-xl px-3 py-2 disabled:opacity-50"
                  >
                    {!presets && <option value="">…</option>}
                    {PRESET_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}分
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            {presetError && <p className="text-rose-400 text-xs mt-2">{presetError}</p>}
          </section>

          <button
            onClick={() => router.push('/setup')}
            className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🎯</span>
              <div className="text-left">
                <p className="text-sm font-medium text-stone-100">目標設定</p>
                <p className="text-stone-500 text-xs mt-0.5">目標体重・期間</p>
              </div>
            </div>
            <span className="text-stone-600">›</span>
          </button>

          <button
            onClick={() => router.push('/wants')}
            className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🔥</span>
              <div className="text-left">
                <p className="text-sm font-medium text-stone-100">チートの予定</p>
                <p className="text-stone-500 text-xs mt-0.5">飲み会など、予定があるものを入れておく</p>
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
