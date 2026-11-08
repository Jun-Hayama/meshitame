'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomNav } from '@/components/BottomNav'
import {
  WANT_KIND_EMOJI,
  WANT_KIND_LABELS,
  type MonthlyWantRow,
  type WantKind,
} from '@/types'
import { formatDateJST, getWantCost } from '@/lib/calories'
import { WANT_COSTS } from '@/lib/calorieConstants'

type AddMode = 'date' | 'frequency'

const KINDS: WantKind[] = ['ramen', 'drinking_party', 'evening_drink']

function monthLabel(year: number, month: number) {
  return `${year}年${month}月`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export default function WantsPage() {
  const router = useRouter()
  const today = formatDateJST(new Date())
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)))
  const [rows, setRows] = useState<MonthlyWantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('date')
  const [kind, setKind] = useState<WantKind>('ramen')
  const [date, setDate] = useState(today)
  const [times, setTimes] = useState(1)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      load(user.id)
    })
  }, [router])

  async function load(userId: string) {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('monthly_wants')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (qErr) {
      setError(
        qErr.message.includes('relation') || qErr.code === '42P01'
          ? 'DBの migration_v2_monthly_wants.sql をまだ実行していないようです'
          : qErr.message
      )
      setRows([])
    } else {
      setRows((data as MonthlyWantRow[]) || [])
    }
    setLoading(false)
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const dated = useMemo(
    () => rows.filter((r) => r.scheduled_date && r.scheduled_date.startsWith(prefix)),
    [rows, prefix]
  )
  const frequent = useMemo(
    () => rows.filter((r) => r.times_per_week != null),
    [rows]
  )

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  async function addWant() {
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const payload: {
      user_id: string
      kind: WantKind
      scheduled_date: string | null
      times_per_week: number | null
      label: string
    } =
      addMode === 'date'
        ? {
            user_id: user.id,
            kind,
            scheduled_date: date,
            times_per_week: null,
            label: WANT_KIND_LABELS[kind],
          }
        : {
            user_id: user.id,
            kind,
            scheduled_date: null,
            times_per_week: times,
            label: WANT_KIND_LABELS[kind],
          }

    const { error: insErr } = await supabase.from('monthly_wants').insert(payload)
    setSaving(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    setShowAdd(false)
    await load(user.id)
  }

  async function removeWant(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: upErr } = await supabase
      .from('monthly_wants')
      .update({ is_active: false })
      .eq('id', id)
    if (upErr) {
      setError(upErr.message)
      return
    }
    await load(user.id)
  }

  const calendarDays = daysInMonth(year, month)
  const firstDow = new Date(year, month - 1, 1).getDay() // 0=日
  const datedByDay = new Map<number, MonthlyWantRow[]>()
  for (const r of dated) {
    const day = Number(r.scheduled_date!.slice(8, 10))
    const list = datedByDay.get(day) ?? []
    list.push(r)
    datedByDay.set(day, list)
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      <div className="max-w-md mx-auto px-5 pt-12">
        <header className="mb-6">
          <h1 className="text-xl font-bold">
            <span className="text-amber-400">★</span> 欲望
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            予定が決まっているものも、毎週の頻度もここに置く
          </p>
        </header>

        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => shiftMonth(-1)} className="text-stone-500 px-2 py-1">‹</button>
          <p className="text-sm font-medium">{monthLabel(year, month)}</p>
          <button type="button" onClick={() => shiftMonth(1)} className="text-stone-500 px-2 py-1">›</button>
        </div>

        {error && (
          <p className="text-rose-400 text-sm mb-4">{error}</p>
        )}

        {loading ? (
          <p className="text-amber-400 text-sm">読み込み中...</p>
        ) : (
          <>
            {/* 簡易カレンダー */}
            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] text-stone-600">
              {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-6">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {Array.from({ length: calendarDays }, (_, i) => {
                const day = i + 1
                const key = `${prefix}-${String(day).padStart(2, '0')}`
                const items = datedByDay.get(day) ?? []
                const isToday = key === today
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setAddMode('date')
                      setDate(key)
                      setShowAdd(true)
                    }}
                    className={`aspect-square rounded-xl text-xs flex flex-col items-center justify-center border ${
                      isToday ? 'border-amber-400/60' : 'border-stone-800'
                    } ${items.length ? 'bg-amber-400/10' : 'bg-stone-900'}`}
                  >
                    <span className={isToday ? 'text-amber-400' : 'text-stone-400'}>{day}</span>
                    {items.length > 0 && (
                      <span className="text-[10px] leading-none mt-0.5">
                        {items.map((w) => WANT_KIND_EMOJI[w.kind]).join('')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <section className="mb-6">
              <h2 className="text-sm font-semibold text-stone-300 mb-3">この月の予定</h2>
              {dated.length === 0 ? (
                <p className="text-stone-600 text-sm">まだ日付指定の欲望はありません</p>
              ) : (
                <ul className="space-y-2">
                  {dated.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{WANT_KIND_EMOJI[w.kind]}</span>
                        <div>
                          <p className="text-sm font-medium">
                            {w.scheduled_date!.slice(5).replace('-', '/')} {w.label || WANT_KIND_LABELS[w.kind]}
                          </p>
                          <p className="text-stone-500 text-xs">+{WANT_COSTS[w.kind]}kcal</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWant(w.id)}
                        className="text-stone-600 text-xs px-2"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mb-6">
              <h2 className="text-sm font-semibold text-stone-300 mb-3">毎週の頻度</h2>
              {frequent.length === 0 ? (
                <p className="text-stone-600 text-sm">例：晩酌は週3回、など</p>
              ) : (
                <ul className="space-y-2">
                  {frequent.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{WANT_KIND_EMOJI[w.kind]}</span>
                        <div>
                          <p className="text-sm font-medium">
                            {w.label || WANT_KIND_LABELS[w.kind]} · 週{w.times_per_week}回
                          </p>
                          <p className="text-stone-500 text-xs">
                            週あたり +{getWantCost({ id: w.id, kind: w.kind, date: null }) * (w.times_per_week ?? 0)}kcal
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWant(w.id)}
                        className="text-stone-600 text-xs px-2"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <button
              type="button"
              onClick={() => {
                setAddMode('date')
                setDate(today.startsWith(prefix) ? today : `${prefix}-01`)
                setShowAdd(true)
              }}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm"
            >
              欲望を追加
            </button>
          </>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
          <div className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">欲望を追加</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="text-stone-500 text-sm">
                閉じる
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setAddMode('date')}
                className={`flex-1 py-2 rounded-xl text-sm ${
                  addMode === 'date' ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                }`}
              >
                日付指定
              </button>
              <button
                type="button"
                onClick={() => setAddMode('frequency')}
                className={`flex-1 py-2 rounded-xl text-sm ${
                  addMode === 'frequency' ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                }`}
              >
                毎週の頻度
              </button>
            </div>

            <p className="text-stone-500 text-xs mb-2">種類</p>
            <div className="flex gap-2 mb-4">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 py-3 rounded-2xl text-sm ${
                    kind === k ? 'bg-amber-400/20 border border-amber-400 text-amber-400' : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {WANT_KIND_EMOJI[k]}
                  <br />
                  {WANT_KIND_LABELS[k]}
                </button>
              ))}
            </div>

            {addMode === 'date' ? (
              <div className="mb-4">
                <label className="text-stone-500 text-xs mb-1.5 block">日付</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm"
                />
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-stone-500 text-xs mb-1.5 block">週何回</label>
                <div className="flex gap-2">
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
              </div>
            )}

            <p className="text-stone-500 text-xs mb-4">
              コスト +{WANT_COSTS[kind]}kcal
              {addMode === 'frequency' ? ` × ${times}回 / 週` : ''}
            </p>

            <button
              type="button"
              disabled={saving}
              onClick={addWant}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
            >
              {saving ? '追加中...' : '追加する'}
            </button>
          </div>
        </div>
      )}

      <BottomNav active="wants" />
    </div>
  )
}
