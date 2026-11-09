'use client'

import { useState } from 'react'
import type { MealSlotTarget, PickedMealExample } from '@/lib/calories'
import { buildMealExampleBreakdown, pickMealExamples } from '@/lib/calories'
import { MEAL_GENRE_LABELS } from '@/lib/mealExamples'

// 行をタップすると内訳を展開（13.2）。開くのはシート全体で1つだけ
function ExampleList({
  title,
  items,
  listKey,
  openKey,
  onToggle,
}: {
  title: string
  items: PickedMealExample[]
  listKey: string
  openKey: string | null
  onToggle: (key: string) => void
}) {
  return (
    <div className="mb-5">
      <p className="text-stone-400 text-xs mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((m) => {
          const key = `${listKey}:${m.name}`
          const open = openKey === key
          return (
            <li key={m.name} className="bg-stone-800 rounded-xl">
              <button
                type="button"
                onClick={() => onToggle(key)}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <span className="text-sm">
                  <span className="text-stone-500 text-[10px] mr-2">{MEAL_GENRE_LABELS[m.genre]}</span>
                  {m.name}
                </span>
                <span className="text-stone-500 text-xs shrink-0 ml-2">
                  {m.kcal}kcal <span className="text-stone-600">{open ? '▴' : '▾'}</span>
                </span>
              </button>
              {open && (
                <ul className="px-3 pb-2.5 space-y-0.5 text-xs text-stone-400">
                  {buildMealExampleBreakdown(m.items).map((row) => (
                    <li key={row.id} className="flex justify-between">
                      <span>{row.label}</span>
                      <span className="text-stone-500">{row.kcal}kcal</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function MealExamplesSheet({ target, onClose }: { target: MealSlotTarget; onClose: () => void }) {
  const { normal, hearty, heartyMinKcal } = pickMealExamples(target.slot, target.kcal)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const toggle = (key: string) => setOpenKey((cur) => (cur === key ? null : key))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-stone-900 rounded-t-3xl px-5 pt-5 pb-10 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">
            {target.label}の目安 ≒ {target.kcal}kcal
          </h3>
          <button type="button" onClick={onClose} className="text-stone-500 text-sm">
            閉じる
          </button>
        </div>
        <ExampleList title="目安くらいの例" items={normal} listKey="normal" openKey={openKey} onToggle={toggle} />
        <ExampleList
          title={`がっつりの例（${heartyMinKcal}kcal〜）`}
          items={hearty}
          listKey="hearty"
          openKey={openKey}
          onToggle={toggle}
        />
        <p className="text-stone-600 text-[11px]">kcalはざっくりの目安です。記録は感覚で選んでOK</p>
      </div>
    </div>
  )
}
