'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { EXERCISE_TYPE_EMOJI, EXERCISE_TYPE_LABELS, type ExerciseLogRow, type ExerciseType } from '@/types'
import { calcExercisePoints } from '@/lib/calories'

const TYPES: ExerciseType[] = ['walking', 'running', 'weights', 'cycling', 'sports', 'steps']
const MINUTE_PRESETS = [10, 20, 30, 45, 60, 90]
const STEP_PRESETS = [3000, 5000, 8000, 10000]

export function ExerciseSheet({
  userId,
  logDate,
  onClose,
  onSaved,
}: {
  userId: string
  logDate: string // YYYY-MM-DD（日本時間）
  onClose: () => void
  onSaved: (row: ExerciseLogRow) => void
}) {
  const [type, setType] = useState<ExerciseType>('walking')
  const [minutes, setMinutes] = useState(30)
  const [steps, setSteps] = useState(8000)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const points =
    type === 'steps' ? calcExercisePoints({ type, steps }) : calcExercisePoints({ type, minutes })

  async function save() {
    setSaving(true)
    setError(null)
    const { data, error: insErr } = await supabase
      .from('exercise_logs')
      .insert({
        user_id: userId,
        log_date: logDate,
        exercise_type: type,
        minutes: type === 'steps' ? null : minutes,
        steps: type === 'steps' ? steps : null,
        points,
      })
      .select()
      .single()
    setSaving(false)
    if (insErr) {
      setError(
        insErr.message.includes('relation') || insErr.code === '42P01'
          ? 'DBの migration_v2_1_cheats_exercise.sql をまだ実行していないようです'
          : insErr.message
      )
      return
    }
    onSaved(data as ExerciseLogRow)
  }

  const chip = (on: boolean) =>
    `py-2 rounded-xl text-sm ${on ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">運動を追加</h3>
          <button type="button" onClick={onClose} className="text-stone-500 text-sm">
            閉じる
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={chip(type === t)}>
              {EXERCISE_TYPE_EMOJI[t]} {EXERCISE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {type === 'steps' ? (
          <>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {STEP_PRESETS.map((n) => (
                <button key={n} type="button" onClick={() => setSteps(n)} className={chip(steps === n)}>
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value) || 0)}
              className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm mb-4"
              aria-label="歩数"
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-6 gap-1.5 mb-2">
              {MINUTE_PRESETS.map((n) => (
                <button key={n} type="button" onClick={() => setMinutes(n)} className={chip(minutes === n)}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value) || 0)}
                className="flex-1 bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm"
                aria-label="時間（分）"
              />
              <span className="text-stone-500 text-sm">分</span>
            </div>
          </>
        )}

        <p className="text-amber-400 text-sm font-medium mb-4">＋{points}pt がメシポに貯まる</p>

        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

        <button
          type="button"
          disabled={saving || points <= 0}
          onClick={save}
          className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
        >
          {saving ? '記録中...' : '記録する'}
        </button>
      </div>
    </div>
  )
}
