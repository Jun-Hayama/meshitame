'use client'

// 減らすペース（docs/v2-spec.md 12-3）の入口。user_profiles.reduce_pace の読み書きだけ
// 1日の目安の計算は lib/calories.ts の calcDailyIntakeFromPace

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ReducePace } from '@/types'
import { DEFAULT_REDUCE_PACE, REDUCE_PACE_KCAL } from '@/lib/calorieConstants'

const cache = new Map<string, Promise<ReducePace>>()

function isReducePace(v: unknown): v is ReducePace {
  return typeof v === 'string' && v in REDUCE_PACE_KCAL
}

async function loadPace(userId: string): Promise<ReducePace> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('reduce_pace')
    .eq('id', userId)
    .maybeSingle<{ reduce_pace: string | null }>()
  if (error) throw error
  return isReducePace(data?.reduce_pace) ? data.reduce_pace : DEFAULT_REDUCE_PACE
}

function getPace(userId: string): Promise<ReducePace> {
  let p = cache.get(userId)
  if (!p) {
    p = loadPace(userId)
    p.catch(() => cache.delete(userId)) // 失敗したら次に開いたときにやり直す
    cache.set(userId, p)
  }
  return p
}

export async function saveReducePace(userId: string, pace: ReducePace): Promise<void> {
  // 初回設定の前でも保存できるように upsert（user_profiles の主キーは id）
  const { error } = await supabase.from('user_profiles').upsert({ id: userId, reduce_pace: pace }, { onConflict: 'id' })
  if (error) throw error
  cache.set(userId, Promise.resolve(pace))
}

function describeError(e: unknown): string {
  const err = e as { message?: string; code?: string }
  if (err?.code === '42703' || err?.message?.includes('reduce_pace')) {
    return 'DBの migration_v2_4_reduce_pace.sql を Supabase で実行してください'
  }
  return err?.message ?? '減らすペースを読み込めませんでした'
}

// 画面用。読み込み中は pace が null。失敗したときは初期値（ゆっくり）で続けて error を出す
export function useReducePace(userId: string | null) {
  const [state, setState] = useState<{ userId: string | null; pace: ReducePace | null; error: string | null }>({
    userId: null,
    pace: null,
    error: null,
  })

  useEffect(() => {
    if (!userId) return
    let alive = true
    getPace(userId).then(
      (pace) => { if (alive) setState({ userId, pace, error: null }) },
      (e) => { if (alive) setState({ userId, pace: DEFAULT_REDUCE_PACE, error: describeError(e) }) }
    )
    return () => { alive = false }
  }, [userId])

  const current = state.userId === userId ? state : { pace: null, error: null }
  return {
    pace: current.pace,
    error: current.error,
    setPace: (pace: ReducePace) => setState({ userId, pace, error: null }),
  }
}

export { describeError as describeReducePaceError }
