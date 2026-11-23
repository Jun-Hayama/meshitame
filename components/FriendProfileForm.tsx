'use client'

// 名前とキャラクター（18章 4）。決めるまで招待のリンクは作れない（相手に名前が出せないため）

import { useState } from 'react'
import type { FriendProfileRow } from '@/types'
import { FRIEND_CHARACTERS, FRIEND_DEFAULT_CHARACTER, FRIEND_NAME_MAX } from '@/lib/calorieConstants'
import { describeFriendError, saveMyProfile } from '@/lib/friends'

export function FriendProfileForm({
  userId,
  profile,
  note = '友だちに見えるのは、この名前とキャラクターです',
  submitLabel = '決める',
  onSaved,
  onCancel,
}: {
  userId: string
  profile: FriendProfileRow | null
  note?: string
  submitLabel?: string
  onSaved: (row: FriendProfileRow) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(profile?.display_name ?? '')
  const [character, setCharacter] = useState(profile?.character_emoji ?? FRIEND_DEFAULT_CHARACTER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()
  const valid = trimmed.length >= 1 && [...trimmed].length <= FRIEND_NAME_MAX

  async function save() {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await saveMyProfile(userId, { display_name: trimmed, character_emoji: character }))
    } catch (e) {
      setError(describeFriendError(e))
    }
    setSaving(false)
  }

  return (
    <div className="bg-stone-900 rounded-3xl p-5">
      <p className="font-bold text-sm mb-1">名前とキャラクター</p>
      <p className="text-stone-500 text-xs mb-4">{note}</p>
      <div className="flex gap-1.5 mb-4">
        {FRIEND_CHARACTERS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCharacter(c)}
            aria-label={c}
            className={`flex-1 aspect-square rounded-2xl text-2xl ${character === c ? 'bg-amber-400/20 ring-2 ring-amber-400' : 'bg-stone-800'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={FRIEND_NAME_MAX}
        placeholder={`表示名（${FRIEND_NAME_MAX}文字まで）`}
        className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm mb-3"
      />
      {error && <p className="text-rose-400 text-xs mb-3">{error}</p>}
      <button
        type="button"
        disabled={!valid || saving}
        onClick={save}
        className="w-full bg-amber-400 text-stone-950 font-bold py-3 rounded-2xl text-sm disabled:opacity-40"
      >
        {saving ? '保存中...' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full mt-2 py-2 text-stone-500 text-sm">
          やめる
        </button>
      )}
    </div>
  )
}
