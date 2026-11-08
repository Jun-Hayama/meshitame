'use client'

import type { MealSlotTarget } from '@/lib/calories'
import { pickMealExamples } from '@/lib/calories'
import { MEAL_GENRE_LABELS, type MealExample } from '@/lib/mealExamples'

function ExampleList({ title, items }: { title: string; items: MealExample[] }) {
  return (
    <div className="mb-5">
      <p className="text-stone-400 text-xs mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((m) => (
          <li key={m.name} className="flex items-center justify-between bg-stone-800 rounded-xl px-3 py-2">
            <span className="text-sm">
              <span className="text-stone-500 text-[10px] mr-2">{MEAL_GENRE_LABELS[m.genre]}</span>
              {m.name}
            </span>
            <span className="text-stone-500 text-xs shrink-0 ml-2">{m.kcal}kcal</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MealExamplesSheet({ target, onClose }: { target: MealSlotTarget; onClose: () => void }) {
  const { normal, hearty, heartyMinKcal } = pickMealExamples(target.slot, target.kcal)

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
        <ExampleList title="目安くらいの例" items={normal} />
        <ExampleList title={`がっつりの例（${heartyMinKcal}kcal〜）`} items={hearty} />
        <p className="text-stone-600 text-[11px]">kcalはざっくりの目安です。記録は感覚で選んでOK</p>
      </div>
    </div>
  )
}
