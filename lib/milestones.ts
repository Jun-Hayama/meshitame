'use client'

// ゲート達成・3%・5%（docs/v2-spec.md 11-5）。判定は lib/calories.ts の detectNewMilestones
// 見つけたら goal_milestones に保存して「1回だけ」にする。閉じるまではこの起動中ずっと出す

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GoalPlanRow, Milestone, WeightAverage } from '@/types'
import { detectNewMilestones, formatDateJST } from '@/lib/calories'

const achievedByGoal = new Map<string, Promise<Set<string>>>()
let pending: Milestone[] = [] // 保存済みで、まだ閉じていないもの（ページを移っても残す）
const listeners = new Set<(ms: Milestone[]) => void>()

function setPending(next: Milestone[]) {
  pending = next
  listeners.forEach((l) => l(pending))
}

function loadAchieved(goal: GoalPlanRow): Promise<Set<string>> {
  let p = achievedByGoal.get(goal.id)
  if (!p) {
    p = Promise.resolve(
      supabase.from('goal_milestones').select('kind').eq('goal_plan_id', goal.id)
    ).then(({ data, error }) => {
      if (error) throw error
      return new Set((data || []).map((r: { kind: string }) => r.kind))
    })
    p.catch(() => achievedByGoal.delete(goal.id))
    achievedByGoal.set(goal.id, p)
  }
  return p
}

async function checkMilestones(goal: GoalPlanRow, avg: WeightAverage) {
  const achieved = await loadAchieved(goal)
  const found = detectNewMilestones(goal, avg, achieved)
  if (found.length === 0) return
  found.forEach((m) => achieved.add(m.kind)) // 先に入れて、同時に2回保存しないようにする

  const { error } = await supabase.from('goal_milestones').upsert(
    found.map((m) => ({
      user_id: goal.user_id,
      goal_plan_id: goal.id,
      kind: m.kind,
      achieved_on: formatDateJST(new Date()),
    })),
    { onConflict: 'goal_plan_id,kind', ignoreDuplicates: true }
  )
  if (error) {
    found.forEach((m) => achieved.delete(m.kind))
    throw error
  }
  setPending([...pending, ...found])
}

// 7日平均が変わるたびに判定する。表示するものと閉じる関数を返す
export function useMilestones(goal: GoalPlanRow | null, avg: WeightAverage) {
  const [shown, setShown] = useState<Milestone[]>(pending)

  useEffect(() => {
    listeners.add(setShown)
    return () => { listeners.delete(setShown) }
  }, [])

  const { avgKg, count, isReference } = avg
  useEffect(() => {
    if (!goal) return
    // テーブルがまだ無いなどで失敗しても、記録の画面は止めない
    checkMilestones(goal, { avgKg, count, isReference }).catch((e) => console.warn('[milestones]', e?.message ?? e))
  }, [goal, avgKg, count, isReference])

  return {
    milestones: shown,
    dismiss: (kind: string) => setPending(pending.filter((m) => m.kind !== kind)),
  }
}
