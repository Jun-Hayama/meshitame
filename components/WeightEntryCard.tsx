'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { WeightLog } from '@/types'
import { formatMonthDayWeekday, parseWeightInput } from '@/lib/calories'

// 体重の入力カード（11-1）。1日1件で、同じ日に入れ直したら上書きする
// compact：ホーム用。入力済みなら「今朝 103.2kg ✓」と小さく出し、タップで入れ直す
export function WeightEntryCard({
  userId,
  date,
  today,
  log,
  compact = false,
  onSaved,
}: {
  userId: string
  date: string // YYYY-MM-DD（日本時間）
  today: string
  log: WeightLog | null
  compact?: boolean
  onSaved: (row: WeightLog) => void
}) {
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [showWaist, setShowWaist] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isToday = date === today
  const title = isToday ? '今朝の体重' : `${formatMonthDayWeekday(date)}の体重`
  const parsed = parseWeightInput(weight)

  function startEdit() {
    setWeight(log ? String(log.weight_kg) : '')
    setWaist(log?.waist_cm ? String(log.waist_cm) : '')
    setError(null)
    setEditing(true)
  }

  async function save() {
    if (parsed === null) return
    setSaving(true)
    setError(null)
    const waistValue = waist.trim() === '' ? null : Number(waist)
    const { data, error: upErr } = await supabase
      .from('weight_logs')
      .upsert(
        {
          user_id: userId,
          measured_at: date,
          weight_kg: parsed,
          waist_cm: waistValue !== null && Number.isFinite(waistValue) && waistValue > 0 ? waistValue : null,
        },
        { onConflict: 'user_id,measured_at' }
      )
      .select()
      .single()
    setSaving(false)
    if (upErr) {
      setError(
        upErr.message.includes('no unique') || upErr.code === '42P10'
          ? 'DBの migration_v2_2_weight_daily.sql を Supabase で実行してください'
          : upErr.message
      )
      return
    }
    setEditing(false)
    setWeight('')
    onSaved(data as WeightLog)
  }

  // 入力済み（ホーム）：小さく表示するだけ
  if (compact && log && !editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-2.5 text-left"
      >
        <span className="text-stone-400 text-xs">
          {isToday ? '今朝' : formatMonthDayWeekday(date)}{' '}
          <span className="text-stone-100 font-bold text-sm">{log.weight_kg}kg</span>{' '}
          <span className="text-amber-400">✓</span>
        </span>
        <span className="text-stone-600 text-xs">修正</span>
      </button>
    )
  }

  const inputValue = editing || !log ? weight : String(log.weight_kg)

  return (
    <div className="bg-stone-900 rounded-2xl px-4 py-3">
      <p className="text-sm font-medium mb-2">{title}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={inputValue}
          onFocus={() => { if (!editing) startEdit() }}
          onChange={(e) => { setEditing(true); setWeight(e.target.value) }}
          placeholder={log ? String(log.weight_kg) : '00.0'}
          className="flex-1 min-w-0 bg-stone-800 rounded-xl px-3 py-2 text-lg font-bold text-center text-amber-400 placeholder-stone-700 focus:outline-none"
        />
        <span className="text-stone-500 text-sm">kg</span>
        <button
          type="button"
          onClick={save}
          disabled={!editing || parsed === null || saving}
          className="bg-amber-400 text-stone-950 font-bold text-sm px-4 py-2 rounded-xl disabled:opacity-30"
        >
          {saving ? '保存中' : log ? '上書き' : '記録'}
        </button>
      </div>

      {!compact && (
        showWaist || log?.waist_cm ? (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={editing ? waist : log?.waist_cm ? String(log.waist_cm) : waist}
              onFocus={() => { if (!editing) startEdit() }}
              onChange={(e) => { setEditing(true); setWaist(e.target.value) }}
              placeholder="ウエスト（任意）"
              className="flex-1 min-w-0 bg-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-300 placeholder-stone-700 focus:outline-none"
            />
            <span className="text-stone-600 text-xs">cm</span>
          </div>
        ) : (
          <button type="button" onClick={() => setShowWaist(true)} className="text-stone-600 text-xs mt-2">
            ＋ウエスト（任意）
          </button>
        )
      )}

      {weight.trim() !== '' && parsed === null && (
        <p className="text-stone-500 text-xs mt-2">数字で入れてください</p>
      )}
      {error && <p className="text-rose-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
