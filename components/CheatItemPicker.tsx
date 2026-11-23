'use client'

// チートを足す画面（docs/v2-spec.md 16章）。どこから足したかで数え方が決まる
// meal：🔥チート（その食事の代わり。品なしでも保存OK）/ extra：追加チート / plan：予定に入れる（日付・食事を選ぶ）
// monthly_wants の行だけを保存する。🔥チートの meal_logs（hearty）は呼び出し側で保存する

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  CHEAT_PLACE_LABELS,
  MEAL_CHOICE_EMOJI,
  MEAL_CHOICE_LABELS,
  type CheatItemSelection,
  type CheatPlace,
  type CustomCheatItemRow,
  type GoalPlanRow,
  type MealSlot,
  type MonthlyWantRow,
} from '@/types'
import {
  buildCheatLabel,
  calcDailyIntakeFromPace,
  calcMealSlotTargets,
  getCheatKind,
  getCheatPlace,
  getMonthlyWantRowCost,
  pickFrequentCheatItems,
  sortCheatItemsByUsage,
  sumCheatItemsKcal,
} from '@/lib/calories'
import { HEARTY_CHEAT_PT, TAMEMESHI_PT } from '@/lib/calorieConstants'
import { useReducePace } from '@/lib/reducePace'
import { CHEAT_GENRES, CHEAT_GENRE_MAP, CHEAT_ITEMS, type CheatGenre, type CheatItem } from '@/lib/cheatItems'

export type CheatPickerTarget =
  | { kind: 'meal'; date: string; slot: MealSlot }
  | { kind: 'extra'; date: string }
  | { kind: 'plan'; date: string }

const PLACES: CheatPlace[] = ['morning', 'lunch', 'dinner', 'extra']
const MEAL_NAMES: Record<MealSlot, string> = { morning: '朝ごはん', lunch: '昼ごはん', dinner: '夜ごはん' }
const PLACE_NOTES: Record<'meal' | 'extra', string> = {
  meal: 'いつもの食事との差だけ数えます',
  extra: '食べた分をそのまま数えます',
}

type HistoryRow = Pick<MonthlyWantRow, 'items' | 'scheduled_date' | 'times_per_week' | 'is_active'>

const itemKey = (i: { genre: string; name: string }) => `${i.genre}:${i.name}`

export function CheatItemPicker({
  userId,
  goal,
  today,
  target,
  editing = null,
  canRemove = false,
  planOptions,
  onClose,
  onSaved,
  onRemoved,
}: {
  userId: string
  goal: GoalPlanRow | null
  today: string // YYYY-MM-DD（日本時間）
  target: CheatPickerTarget
  editing?: MonthlyWantRow | null // 直すチート（meal・extra）
  canRemove?: boolean // 「取り消す」を出す（editing がなくても、品なしの🔥チートがあるとき）
  // plan の日付の範囲・選べる食事・見出し・ボタン名（一緒に食べる約束：明日から60日以内・昼／夜／追加チート）
  planOptions?: { min: string; max: string; places: CheatPlace[]; title?: string; submitLabel?: string }
  onClose: () => void
  onSaved: (row: MonthlyWantRow | null) => void // meal で品を選ばなかったときは null
  onRemoved?: () => void
}) {
  const [date, setDate] = useState(target.date)
  const [place, setPlace] = useState<CheatPlace>(
    target.kind === 'meal' ? target.slot : target.kind === 'extra' ? 'extra' : 'dinner'
  )
  const [genre, setGenre] = useState<CheatGenre>('ramen')
  const [search, setSearch] = useState('')
  const [selections, setSelections] = useState<CheatItemSelection[]>(editing?.items ?? [])
  const [customs, setCustoms] = useState<CustomCheatItemRow[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [showList, setShowList] = useState(false)
  const [showFree, setShowFree] = useState(false)
  const [freeName, setFreeName] = useState('')
  const [freeKcal, setFreeKcal] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('custom_cheat_items').select('*').eq('user_id', userId),
      supabase
        .from('monthly_wants')
        .select('items, scheduled_date, times_per_week, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('items', 'is', null),
    ]).then(([{ data: customData, error: cErr }, { data: histData }]) => {
      if (cErr) {
        setError(
          cErr.message.includes('relation') || cErr.code === '42P01'
            ? 'DBの migration_v2_1_cheats_exercise.sql をまだ実行していないようです'
            : cErr.message
        )
      }
      setCustoms((customData as CustomCheatItemRow[]) || [])
      setHistory((histData as HistoryRow[]) || [])
    })
  }, [userId])

  const allItems = useMemo<CheatItem[]>(
    () => [
      ...CHEAT_ITEMS,
      ...customs.map((c) => ({ genre: c.genre as CheatGenre, name: c.name, kcal: c.kcal, custom: true })),
    ],
    [customs]
  )
  const frequent = useMemo(() => pickFrequentCheatItems(history, today), [history, today])

  const listed = useMemo(() => {
    const q = search.trim()
    const filtered = q
      ? allItems.filter((i) => i.name.includes(q) || CHEAT_GENRE_MAP[i.genre]?.label.includes(q))
      : allItems.filter((i) => i.genre === genre)
    return sortCheatItemsByUsage(filtered, history)
  }, [allItems, search, genre, history])

  // 食事のチートのコストに使う食事の目安。1日の目安 = 必要量 − 減らすペース（12-3）
  const { pace } = useReducePace(userId)
  const slotTargets = useMemo(
    () => (goal && pace ? calcMealSlotTargets(calcDailyIntakeFromPace(goal.tdee, goal.bmr, pace)) : []),
    [goal, pace]
  )

  const isMeal = place !== 'extra'
  const totalKcal = sumCheatItemsKcal(selections)
  const kind = getCheatKind(selections)
  const cheatType = isMeal ? 'replace' : 'addon'
  const slot: MealSlot | null = isMeal ? (place as MealSlot) : null
  const costKcal = getMonthlyWantRowCost({ kind, cheat_type: cheatType, replace_slot: slot, total_kcal: totalKcal }, slotTargets)
  const slotTarget = slotTargets.find((t) => t.slot === slot)
  const allowEmpty = target.kind === 'meal'

  const minDate = planOptions?.min ?? today
  const places = planOptions?.places ?? PLACES
  const title =
    planOptions?.title && target.kind === 'plan'
      ? planOptions.title
      : target.kind === 'meal'
      ? `${MEAL_NAMES[target.slot]}をチートに`
      : target.kind === 'extra'
        ? '追加チートを足す'
        : '予定に入れる'
  const note = PLACE_NOTES[isMeal ? 'meal' : 'extra']

  function addItem(item: Pick<CheatItemSelection, 'genre' | 'name' | 'kcal'>) {
    const found = selections.find((s) => itemKey(s) === itemKey(item))
    setSelections(
      found
        ? selections.map((s) => (s === found ? { ...s, qty: s.qty + 1 } : s))
        : [...selections, { genre: item.genre, name: item.name, kcal: item.kcal, qty: 1 }]
    )
  }

  function changeQty(key: string, delta: number) {
    setSelections(selections.map((s) => (itemKey(s) === key ? { ...s, qty: s.qty + delta } : s)).filter((s) => s.qty > 0))
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
      .upsert({ user_id: userId, genre, name, kcal: Math.round(kcal) }, { onConflict: 'user_id,genre,name' })
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

  async function deactivate(id: string) {
    const { error: upErr } = await supabase.from('monthly_wants').update({ is_active: false }).eq('id', id)
    if (upErr) throw upErr
  }

  async function save() {
    if (selections.length === 0 && !allowEmpty) {
      setError('食べたものを1つ以上選んでください')
      return
    }
    if (target.kind === 'plan' && date < today) {
      setError('日付は今日以降にしてください')
      return
    }
    if (target.kind === 'plan' && planOptions && (date < planOptions.min || date > planOptions.max)) {
      setError('日付は明日から60日以内にしてください')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // 品を選ばない🔥チート：品つきのチートがあれば外す（呼び出し側で hearty を保存）
      if (selections.length === 0) {
        if (editing) await deactivate(editing.id)
        setSaving(false)
        onSaved(null)
        return
      }
      const values = {
        kind,
        label: buildCheatLabel(selections),
        cheat_type: cheatType,
        replace_slot: slot,
        items: selections,
        total_kcal: totalKcal,
      }
      const { data, error: saveErr } = editing
        ? await supabase.from('monthly_wants').update(values).eq('id', editing.id).select().single()
        : await supabase
            .from('monthly_wants')
            .insert({ user_id: userId, scheduled_date: date, times_per_week: null, ...values })
            .select()
            .single()
      if (saveErr) throw saveErr
      setSaving(false)
      onSaved(data as MonthlyWantRow)
    } catch (e) {
      setSaving(false)
      setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? '保存できませんでした')
    }
  }

  async function remove() {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editing) await deactivate(editing.id)
      setSaving(false)
      onRemoved?.()
    } catch (e) {
      setSaving(false)
      setError((e as { message?: string }).message ?? '取り消せませんでした')
    }
  }

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs ${on ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'}`
  const selectedKeys = new Set(selections.map(itemKey))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-stone-500 text-xs mt-0.5">{note}</p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-500 text-sm shrink-0 ml-3">
            閉じる
          </button>
        </div>

        {/* 予定に入れる：日付（今日以降）と食事 */}
        {target.kind === 'plan' && (
          <div className="mb-4 space-y-2">
            <input
              type="date"
              value={date}
              min={minDate}
              max={planOptions?.max}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm"
            />
            <div className="flex gap-1.5">
              {places.map((p) => (
                <button key={p} type="button" onClick={() => setPlace(p)} className={`flex-1 ${chip(place === p)}`}>
                  {CHEAT_PLACE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* よく食べるもの（1タップで選ぶ） */}
        {frequent.length > 0 && (
          <div className="mb-4">
            <p className="text-stone-500 text-xs mb-1.5">よく食べるもの</p>
            <div className="flex flex-wrap gap-1.5">
              {frequent.map((i) => (
                <button
                  key={itemKey(i)}
                  type="button"
                  onClick={() => addItem(i)}
                  className={`px-3 py-1.5 rounded-full text-xs ${
                    selectedKeys.has(itemKey(i)) ? 'bg-amber-400/20 text-amber-400 ring-1 ring-amber-400' : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  {CHEAT_GENRE_MAP[i.genre as CheatGenre]?.emoji} {i.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 選んだもの（数量は ＋／−） */}
        {selections.length > 0 && (
          <ul className="space-y-1.5 mb-4">
            {selections.map((s) => (
              <li key={itemKey(s)} className="flex items-center justify-between bg-stone-800 rounded-xl px-3 py-2">
                <span className="text-sm min-w-0 truncate">
                  {CHEAT_GENRE_MAP[s.genre as CheatGenre]?.emoji} {s.name}
                  <span className="text-stone-500 text-xs ml-2">{s.kcal}kcal</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => changeQty(itemKey(s), -1)}
                    aria-label="減らす"
                    className="w-7 h-7 rounded-full bg-stone-700 text-stone-300"
                  >
                    −
                  </button>
                  <span className="text-sm w-5 text-center">{s.qty}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(itemKey(s), 1)}
                    aria-label="増やす"
                    className="w-7 h-7 rounded-full bg-stone-700 text-stone-300"
                  >
                    ＋
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 品の一覧 */}
        {showList || frequent.length === 0 ? (
          <>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前で探す"
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
                <button key={itemKey(i)} type="button" onClick={() => addItem(i)} className="bg-stone-800 rounded-xl px-3 py-2 text-left">
                  <p className="text-sm leading-tight">{i.name}</p>
                  <p className="text-stone-500 text-[11px]">
                    {i.topping ? '追加 ' : ''}
                    {i.kcal}kcal{i.custom ? ' · 自分で追加' : ''}
                  </p>
                </button>
              ))}
            </div>

            {showFree ? (
              <div className="bg-stone-950 rounded-2xl p-3 mb-4">
                <p className="text-stone-500 text-xs mb-2">{CHEAT_GENRE_MAP[genre].label} に足す（次から一覧に出ます）</p>
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
                    足す
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowFree(true)} className="text-amber-400 text-xs mb-4">
                ＋ 一覧にないものを入れる
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={() => setShowList(true)} className="text-amber-400 text-xs mb-4">
            ほかのものを探す
          </button>
        )}

        {/* 数える kcal */}
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl px-4 py-3 mb-4">
          {selections.length === 0 ? (
            <p className="text-stone-300 text-xs">
              {allowEmpty
                ? `選ばずに保存すると ${HEARTY_CHEAT_PT}kcal で数えます`
                : '食べたもの・飲んだものを選んでください'}
            </p>
          ) : (
            <>
              <p className="text-amber-400 text-sm font-medium">
                数えるのは {costKcal.toLocaleString('ja-JP')}kcal
                {costKcal > 0 && (
                  <span className="text-stone-400 text-xs font-normal ml-2">
                    {MEAL_CHOICE_EMOJI.light}
                    {MEAL_CHOICE_LABELS.light}
                    {Math.ceil(costKcal / TAMEMESHI_PT)}回ぶん
                  </span>
                )}
              </p>
              <p className="text-stone-500 text-[11px] mt-1">
                合計 {totalKcal.toLocaleString('ja-JP')}kcal
                {isMeal && slotTarget ? `（${CHEAT_PLACE_LABELS[place]}の目安 ${slotTarget.kcal}kcal との差）` : ''}
              </p>
            </>
          )}
        </div>

        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

        <button
          type="button"
          disabled={saving || (selections.length === 0 && !allowEmpty)}
          onClick={save}
          className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
        >
          {saving ? '保存中...' : target.kind === 'plan' ? planOptions?.submitLabel ?? '予定に入れる' : '保存する'}
        </button>
        {(editing || canRemove) && onRemoved && (
          <button
            type="button"
            disabled={saving}
            onClick={remove}
            className={`w-full mt-3 py-3 rounded-2xl text-sm ${
              confirmRemove ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-stone-500'
            }`}
          >
            {confirmRemove ? 'もう一度タップで取り消す' : 'このチートを取り消す'}
          </button>
        )}
      </div>
    </div>
  )
}

// 行が食事のチートか追加チートか（一覧の表示用）
export function describeCheatPlace(row: Pick<MonthlyWantRow, 'cheat_type' | 'replace_slot'>): string {
  return CHEAT_PLACE_LABELS[getCheatPlace(row)]
}
