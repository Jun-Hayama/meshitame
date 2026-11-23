// 予定のチートの保存（16章 4・18章）：monthly_wants に1行、食事が昼・夜（朝）なら meal_logs にもその日・その食事の hearty
// チートのタブの「予定に入れる」、一緒に食べる約束を作る・参加するで同じ形にする

import { supabase } from '@/lib/supabase'
import type { CheatItemSelection, CheatPlace, MealLogRow, MonthlyWantRow } from '@/types'
import { buildCheatLabel, getCheatKind, getCheatPlace, sumCheatItemsKcal } from '@/lib/calories'

// 食事の予定なら、その日・その食事の hearty を保存する（追加チートは何もしない）
export async function savePlannedHearty(userId: string, row: MonthlyWantRow): Promise<MealLogRow | null> {
  const place = getCheatPlace(row)
  if (place === 'extra' || !row.scheduled_date) return null
  const { data, error } = await supabase
    .from('meal_logs')
    .upsert({ user_id: userId, log_date: row.scheduled_date, slot: place, choice: 'hearty' }, { onConflict: 'user_id,log_date,slot' })
    .select()
    .maybeSingle()
  if (error) throw error
  return (data as MealLogRow) ?? null
}

// 品と日付・食事から予定のチートを入れる（約束に参加したとき）
export async function insertPlannedCheat(
  userId: string,
  values: { date: string; place: CheatPlace; items: CheatItemSelection[] }
): Promise<MonthlyWantRow> {
  const isMeal = values.place !== 'extra'
  const { data, error } = await supabase
    .from('monthly_wants')
    .insert({
      user_id: userId,
      scheduled_date: values.date,
      times_per_week: null,
      kind: getCheatKind(values.items),
      label: buildCheatLabel(values.items),
      cheat_type: isMeal ? 'replace' : 'addon',
      replace_slot: isMeal ? values.place : null,
      items: values.items,
      total_kcal: sumCheatItemsKcal(values.items),
    })
    .select()
    .single()
  if (error) throw error
  const row = data as MonthlyWantRow
  await savePlannedHearty(userId, row)
  return row
}
