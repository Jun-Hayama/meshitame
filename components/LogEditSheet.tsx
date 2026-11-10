'use client'

// ログ（docs/v2-spec.md 14.3）：メシための記録を「いつもの」「がっつり」に変える、または取り消す（記録を消す = いつもの扱い）

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMonthDayWeekday } from '@/lib/calories'
import { MEAL_CHOICE_EMOJI, MEAL_CHOICE_LABELS, type MealChoice, type MealLogRow, type MealSlot } from '@/types'

const SLOT_LABELS: Record<MealSlot, string> = { morning: '朝', lunch: '昼', dinner: '夜' }
const CHOICES: Exclude<MealChoice, 'light'>[] = ['normal', 'hearty']

export function LogEditSheet({
  log,
  onClose,
  onSaved,
  onDeleted,
}: {
  log: MealLogRow
  onClose: () => void
  onSaved: (row: MealLogRow) => void
  onDeleted: (id: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(choice: MealChoice) {
    setSaving(true)
    setError(null)
    const { data, error: upErr } = await supabase.from('meal_logs').update({ choice }).eq('id', log.id).select().single()
    setSaving(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    onSaved(data as MealLogRow)
  }

  async function remove() {
    setSaving(true)
    setError(null)
    const { error: delErr } = await supabase.from('meal_logs').delete().eq('id', log.id)
    setSaving(false)
    if (delErr) {
      setError(delErr.message)
      return
    }
    onDeleted(log.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-bold">
            {formatMonthDayWeekday(log.log_date)} {SLOT_LABELS[log.slot]}
          </h3>
          <button type="button" onClick={onClose} className="text-stone-500 text-sm">
            閉じる
          </button>
        </div>
        <p className="text-stone-500 text-xs mb-4">
          いまは {MEAL_CHOICE_EMOJI.light} {MEAL_CHOICE_LABELS.light}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={saving}
              onClick={() => change(choice)}
              className="py-3 rounded-2xl text-sm bg-stone-800 text-stone-200 disabled:opacity-50"
            >
              {MEAL_CHOICE_EMOJI[choice]} {MEAL_CHOICE_LABELS[choice]}に変える
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={remove}
          className="w-full py-3 rounded-2xl text-sm text-stone-500 disabled:opacity-50"
        >
          記録を取り消す（いつもの扱い）
        </button>

        {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}
      </div>
    </div>
  )
}
