'use client'

// 月の目標（1日の貯金・目安）の入口。ホーム・チート・CheatItemPicker はすべてここを使う
// 計算は lib/calories.ts の純粋関数。ここは保存済みの行の読み書きだけ（docs/v2-spec.md 11-3）

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GoalPlanRow, MonthTargets, MonthlyTargetRow, WeightLog } from '@/types'
import {
  addDaysToDateStr,
  calcWeightAverage,
  decideMonthTargets,
  formatDateJST,
  getMonthStartAverageDate,
  getMonthTargetMode,
  monthTargetsFromRow,
  monthTargetsToRow,
  planMonthTargets,
} from '@/lib/calories'
import { WEIGHT_AVG_DAYS } from '@/lib/calorieConstants'

const cache = new Map<string, Promise<MonthTargets>>()
const cacheKey = (goal: GoalPlanRow, year: number, month: number) => `${goal.id}:${year}-${month}`

async function selectRow(goal: GoalPlanRow, year: number, month: number) {
  return supabase
    .from('monthly_targets')
    .select('*')
    .eq('goal_plan_id', goal.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle<MonthlyTargetRow>()
}

// 保存済みならその行。なければ月初の7日平均（前月の最後の7日間）で決めて保存する
async function loadOrDecide(goal: GoalPlanRow, year: number, month: number): Promise<MonthTargets> {
  const today = formatDateJST(new Date())
  const mode = getMonthTargetMode(goal, year, month, today)
  if (mode !== 'decide') return planMonthTargets(goal, year, month, mode)

  const { data: saved, error: selErr } = await selectRow(goal, year, month)
  if (selErr) throw selErr
  if (saved) return monthTargetsFromRow(goal, saved)

  const avgDate = getMonthStartAverageDate(year, month)
  const { data: logs, error: logErr } = await supabase
    .from('weight_logs')
    .select('measured_at, weight_kg')
    .eq('user_id', goal.user_id)
    .gte('measured_at', addDaysToDateStr(avgDate, -(WEIGHT_AVG_DAYS - 1)))
    .lte('measured_at', avgDate)
  if (logErr) throw logErr

  const decided = decideMonthTargets(goal, year, month, calcWeightAverage((logs as WeightLog[]) || [], avgDate))
  const { error: insErr } = await supabase
    .from('monthly_targets')
    .upsert(monthTargetsToRow(decided, goal.user_id, goal.id), {
      onConflict: 'goal_plan_id,year,month',
      ignoreDuplicates: true,
    })
  if (insErr) throw insErr

  // 別の端末が先に保存していたら、そちらを正にする
  const { data: winner, error: reErr } = await selectRow(goal, year, month)
  if (reErr) throw reErr
  return winner ? monthTargetsFromRow(goal, winner) : decided
}

export function getMonthTargets(goal: GoalPlanRow, year: number, month: number): Promise<MonthTargets> {
  const key = cacheKey(goal, year, month)
  let p = cache.get(key)
  if (!p) {
    p = loadOrDecide(goal, year, month)
    p.catch(() => cache.delete(key)) // 失敗したら次に開いたときにやり直す
    cache.set(key, p)
  }
  return p
}

// capped の案内で「そのまま続ける」を選んだ
export async function dismissCappedNotice(goal: GoalPlanRow, year: number, month: number): Promise<MonthTargets> {
  const { error } = await supabase
    .from('monthly_targets')
    .update({ capped_dismissed: true })
    .eq('goal_plan_id', goal.id)
    .eq('year', year)
    .eq('month', month)
  if (error) throw error
  const current = await getMonthTargets(goal, year, month)
  const next = { ...current, cappedDismissed: true }
  cache.set(cacheKey(goal, year, month), Promise.resolve(next))
  return next
}

function describeError(e: unknown): string {
  const err = e as { message?: string; code?: string }
  if (err?.code === '42P01' || err?.message?.includes('relation')) {
    return 'DBの migration_v2_3_monthly_targets.sql を Supabase で実行してください'
  }
  return err?.message ?? '月の目標を読み込めませんでした'
}

// 画面用。読み込み中・失敗時は targets が null
export function useMonthTargets(goal: GoalPlanRow | null, year: number, month: number) {
  const [state, setState] = useState<{ key: string; targets: MonthTargets | null; error: string | null }>({
    key: '',
    targets: null,
    error: null,
  })
  const key = goal ? cacheKey(goal, year, month) : ''

  useEffect(() => {
    if (!goal) return
    let alive = true
    getMonthTargets(goal, year, month).then(
      (targets) => { if (alive) setState({ key, targets, error: null }) },
      (e) => { if (alive) setState({ key, targets: null, error: describeError(e) }) }
    )
    return () => { alive = false }
  }, [goal, year, month, key])

  const current = state.key === key ? state : { targets: null, error: null }
  return {
    targets: current.targets,
    error: current.error,
    // 「そのまま続ける」を選んだあと、画面の値も差し替える
    setTargets: (targets: MonthTargets) => setState({ key, targets, error: null }),
  }
}
