'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  CheatItemSelection,
  CheatType,
  CustomCheatItemRow,
  GoalPlanRow,
  MealSlot,
  MonthlyWantRow,
} from '@/types'
import {
  buildCheatLabel,
  calcCurrentMonthTargets,
  calcMealSlotTargets,
  convertCheatCost,
  getCheatKind,
  getDefaultCheatType,
  getMonthlyWantRowCost,
  sortCheatItemsByUsage,
  sumCheatItemsKcal,
} from '@/lib/calories'
import { CHEAT_GENRES, CHEAT_GENRE_MAP, CHEAT_ITEMS, type CheatGenre, type CheatItem } from '@/lib/cheatItems'

type AddMode = 'date' | 'frequency'

const SLOT_OPTIONS: { slot: MealSlot; label: string }[] = [
  { slot: 'morning', label: '朝' },
  { slot: 'lunch', label: '昼' },
  { slot: 'dinner', label: '夜' },
]

const itemKey = (i: { genre: string; name: string }) => `${i.genre}:${i.name}`

export function CheatItemPicker({
  userId,
  goal,
  initialDate,
  onClose,
  onSaved,
}: {
  userId: string
  goal: GoalPlanRow | null
  initialDate: string // YYYY-MM-DD（日本時間）
  onClose: () => void
  onSaved: (row: MonthlyWantRow) => void
}) {
  const [mode, setMode] = useState<AddMode>('date')
  const [date, setDate] = useState(initialDate)
  const [times, setTimes] = useState(1)
  const [genre, setGenre] = useState<CheatGenre>('ramen')
  const [search, setSearch] = useState('')
  const [selections, setSelections] = useState<CheatItemSelection[]>([])
  const [cheatType, setCheatType] = useState<CheatType>('replace')
  const [typeTouched, setTypeTouched] = useState(false)
  const [replaceSlot, setReplaceSlot] = useState<MealSlot>('dinner')
  const [customs, setCustoms] = useState<CustomCheatItemRow[]>([])
  const [history, setHistory] = useState<{ items: CheatItemSelection[] | null }[]>([])
  const [showFree, setShowFree] = useState(false)
  const [freeName, setFreeName] = useState('')
  const [freeKcal, setFreeKcal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('custom_cheat_items').select('*').eq('user_id', userId),
      // 使った回数順のため、削除したものも含めた履歴を読む
      supabase.from('monthly_wants').select('items').eq('user_id', userId).not('items', 'is', null),
    ]).then(([{ data: customData, error: cErr }, { data: histData }]) => {
      if (cErr) {
        setError(
          cErr.message.includes('relation') || cErr.code === '42P01'
            ? 'DBの migration_v2_1_cheats_exercise.sql をまだ実行していないようです'
            : cErr.message
        )
      }
      setCustoms((customData as CustomCheatItemRow[]) || [])
      setHistory((histData as { items: CheatItemSelection[] | null }[]) || [])
    })
  }, [userId])

  const allItems = useMemo<CheatItem[]>(
    () => [
      ...CHEAT_ITEMS,
      ...customs.map((c) => ({ genre: c.genre as CheatGenre, name: c.name, kcal: c.kcal, custom: true })),
    ],
    [customs]
  )

  const listed = useMemo(() => {
    const q = search.trim()
    const filtered = q
      ? allItems.filter((i) => i.name.includes(q) || CHEAT_GENRE_MAP[i.genre]?.label.includes(q))
      : allItems.filter((i) => i.genre === genre)
    return sortCheatItemsByUsage(filtered, history)
  }, [allItems, search, genre, history])

  // コストは日付の月の目安で計算する（頻度ベースは今日の月）
  const slotTargets = useMemo(() => {
    if (!goal) return []
    const when = mode === 'date' && date ? new Date(`${date}T12:00:00+09:00`) : new Date()
    return calcMealSlotTargets(calcCurrentMonthTargets(goal, when).dailyIntakeKcal)
  }, [goal, mode, date])

  const totalKcal = sumCheatItemsKcal(selections)
  const kind = getCheatKind(selections)
  const costPt = getMonthlyWantRowCost(
    { kind, cheat_type: cheatType, replace_slot: replaceSlot, total_kcal: totalKcal },
    slotTargets
  )
  const conversion = convertCheatCost(costPt)
  const slotTarget = slotTargets.find((t) => t.slot === replaceSlot)

  function updateSelections(next: CheatItemSelection[]) {
    setSelections(next)
    if (!typeTouched) setCheatType(getDefaultCheatType(next))
  }

  function addItem(item: Pick<CheatItem, 'genre' | 'name' | 'kcal'>) {
    const found = selections.find((s) => itemKey(s) === itemKey(item))
    updateSelections(
      found
        ? selections.map((s) => (s === found ? { ...s, qty: s.qty + 1 } : s))
        : [...selections, { genre: item.genre, name: item.name, kcal: item.kcal, qty: 1 }]
    )
  }

  function changeQty(key: string, delta: number) {
    updateSelections(
      selections.map((s) => (itemKey(s) === key ? { ...s, qty: s.qty + delta } : s)).filter((s) => s.qty > 0)
    )
  }

  async function addFreeItem() {
    const name = freeName.trim()
    const kcal = Number(freeKcal)
    if (!name || !Number.isFinite(kcal) || kcal <= 0) {
      setError('名前とkcalを入れてください')
      return
    }
    setError(null)
    const { data, error: insErr } = await supabase
      .from('custom_cheat_items')
      .upsert(
        { user_id: userId, genre, name, kcal: Math.round(kcal) },
        { onConflict: 'user_id,genre,name' }
      )
      .select()
      .maybeSingle()
    if (insErr) {
      setError(insErr.message)
      return
    }
    if (data) {
      const row = data as CustomCheatItemRow
      setCustoms((prev) => [...prev.filter((c) => c.id !== row.id), row])
      addItem({ genre: row.genre as CheatGenre, name: row.name, kcal: row.kcal })
    }
    setFreeName('')
    setFreeKcal('')
    setShowFree(false)
  }

  async function save() {
    if (selections.length === 0) {
      setError('アイテムを1つ以上選んでください')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: insErr } = await supabase
      .from('monthly_wants')
      .insert({
        user_id: userId,
        kind,
        scheduled_date: mode === 'date' ? date : null,
        times_per_week: mode === 'frequency' ? times : null,
        label: buildCheatLabel(selections),
        cheat_type: cheatType,
        replace_slot: cheatType === 'replace' ? replaceSlot : null,
        items: selections,
        total_kcal: totalKcal,
      })
      .select()
      .single()
    setSaving(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    onSaved(data as MonthlyWantRow)
  }

  const tabClass = (on: boolean) =>
    `flex-1 py-2 rounded-xl text-sm ${on ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">チートを追加</h3>
          <button type="button" onClick={onClose} className="text-stone-500 text-sm">
            閉じる
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setMode('date')} className={tabClass(mode === 'date')}>
            日付指定
          </button>
          <button type="button" onClick={() => setMode('frequency')} className={tabClass(mode === 'frequency')}>
            毎週の頻度
          </button>
        </div>

        {mode === 'date' ? (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm mb-4"
          />
        ) : (
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTimes(n)}
                className={`flex-1 py-2 rounded-xl text-sm ${
                  times === n ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* 選んだ中身 */}
        {selections.length > 0 && (
          <ul className="space-y-1.5 mb-4">
            {selections.map((s) => (
              <li key={itemKey(s)} className="flex items-center justify-between bg-stone-800 rounded-xl px-3 py-2">
                <span className="text-sm">
                  {CHEAT_GENRE_MAP[s.genre as CheatGenre]?.emoji} {s.name}
                  <span className="text-stone-500 text-xs ml-2">{s.kcal}kcal</span>
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeQty(itemKey(s), -1)}
                    className="w-7 h-7 rounded-full bg-stone-700 text-stone-300"
                  >
                    −
                  </button>
                  <span className="text-sm w-5 text-center">{s.qty}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(itemKey(s), 1)}
                    className="w-7 h-7 rounded-full bg-stone-700 text-stone-300"
                  >
                    ＋
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 検索とジャンルのタブ */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="名前で検索"
          className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-2.5 text-sm mb-3"
        />
        {!search.trim() && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
            {CHEAT_GENRES.map((g) => (
              <button
                key={g.genre}
                type="button"
                onClick={() => setGenre(g.genre)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs ${
                  genre === g.genre ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                }`}
              >
                {g.emoji} {g.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {listed.map((i) => (
            <button
              key={itemKey(i)}
              type="button"
              onClick={() => addItem(i)}
              className="bg-stone-800 rounded-xl px-3 py-2 text-left"
            >
              <p className="text-sm leading-tight">{i.name}</p>
              <p className="text-stone-500 text-[11px]">
                {i.topping ? '+' : ''}
                {i.kcal}kcal{i.custom ? ' · 自分で追加' : ''}
              </p>
            </button>
          ))}
        </div>

        {showFree ? (
          <div className="bg-stone-950 rounded-2xl p-3 mb-4">
            <p className="text-stone-500 text-xs mb-2">
              {CHEAT_GENRE_MAP[genre].label} に追加（次から一覧に出ます）
            </p>
            <div className="flex gap-2">
              <input
                value={freeName}
                onChange={(e) => setFreeName(e.target.value)}
                placeholder="名前"
                className="flex-1 min-w-0 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm"
              />
              <input
                value={freeKcal}
                onChange={(e) => setFreeKcal(e.target.value)}
                inputMode="numeric"
                placeholder="kcal"
                className="w-20 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm"
              />
              <button type="button" onClick={addFreeItem} className="bg-amber-400 text-stone-950 rounded-xl px-3 text-sm font-bold">
                追加
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowFree(true)} className="text-amber-400 text-xs mb-4">
            ＋ 一覧にないものを入れる
          </button>
        )}

        {/* タイプ */}
        <div className="flex gap-2 mb-3">
          {(['replace', 'addon'] as CheatType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setCheatType(t)
                setTypeTouched(true)
              }}
              className={tabClass(cheatType === t)}
            >
              {t === 'replace' ? '置き換え（食事の代わり）' : '上乗せ（追加で食べる）'}
            </button>
          ))}
        </div>
        {cheatType === 'replace' && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-stone-500 text-xs">どの食事の代わり？</span>
            {SLOT_OPTIONS.map((o) => (
              <button
                key={o.slot}
                type="button"
                onClick={() => setReplaceSlot(o.slot)}
                className={`px-3 py-1.5 rounded-xl text-xs ${
                  replaceSlot === o.slot ? 'bg-amber-400/20 border border-amber-400 text-amber-400' : 'bg-stone-800 text-stone-400'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {/* 換算 */}
        {selections.length > 0 && (
          <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl px-4 py-3 mb-4">
            <p className="text-amber-400 text-sm font-medium">
              このチートは {costPt}pt ＝ 軽め{conversion.lightMeals}回 or ウォーキング{conversion.walkingMinutes}分
            </p>
            <p className="text-stone-500 text-[11px] mt-1">
              合計 {totalKcal}kcal
              {cheatType === 'replace' && slotTarget ? `（${SLOT_OPTIONS.find((o) => o.slot === replaceSlot)?.label}の目安 ${slotTarget.kcal}kcal の代わり）` : ''}
              {mode === 'frequency' ? ` · 週${times}回` : ''}
            </p>
          </div>
        )}

        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

        <button
          type="button"
          disabled={saving || selections.length === 0}
          onClick={save}
          className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
        >
          {saving ? '追加中...' : '追加する'}
        </button>
      </div>
    </div>
  )
}
