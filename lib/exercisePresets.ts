'use client'

// うごための時間（docs/v2-spec.md 18-追記 v2.8.1）。user_profiles.exercise_presets の読み書きだけ
// 値のチェックは lib/calories.ts の normalizeExercisePresets

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ExercisePresets } from '@/types'
import { normalizeExercisePresets } from '@/lib/calories'

const cache = new Map<string, Promise<ExercisePresets>>()

async function loadPresets(userId: string): Promise<ExercisePresets> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('exercise_presets')
    .eq('id', userId)
    .maybeSingle<{ exercise_presets: unknown }>()
  if (error) throw error
  return normalizeExercisePresets(data?.exercise_presets)
}

function getPresets(userId: string): Promise<ExercisePresets> {
  let p = cache.get(userId)
  if (!p) {
    p = loadPresets(userId)
    p.catch(() => cache.delete(userId)) // 失敗したら次に開いたときにやり直す
    cache.set(userId, p)
  }
  return p
}

export async function saveExercisePresets(userId: string, presets: ExercisePresets): Promise<void> {
  // 初回設定の前でも保存できるように upsert（user_profiles の主キーは id）
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, exercise_presets: presets }, { onConflict: 'id' })
  if (error) throw error
  cache.set(userId, Promise.resolve(presets))
}

export function describeExercisePresetsError(e: unknown): string {
  const err = e as { message?: string; code?: string }
  if (err?.code === '42703' || err?.message?.includes('exercise_presets')) {
    return 'DBの migration_v2_8_1_exercise_presets.sql を Supabase で実行してください'
  }
  return err?.message ?? 'うごための時間を保存できませんでした'
}

// 画面用。読み込み中は presets が null。失敗したとき（行がない・列がまだない）はすべて30分で続ける
export function useExercisePresets(userId: string | null) {
  const [state, setState] = useState<{ userId: string | null; presets: ExercisePresets | null }>({
    userId: null,
    presets: null,
  })

  useEffect(() => {
    if (!userId) return
    let alive = true
    getPresets(userId).then(
      (presets) => { if (alive) setState({ userId, presets }) },
      () => { if (alive) setState({ userId, presets: normalizeExercisePresets(null) }) }
    )
    return () => { alive = false }
  }, [userId])

  return {
    presets: state.userId === userId ? state.presets : null,
    setPresets: (presets: ExercisePresets) => setState({ userId, presets }),
  }
}
