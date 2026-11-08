'use client'

import { useRouter } from 'next/navigation'

type Tab = 'home' | 'wants' | 'weight' | 'settings'

const TABS: { id: Tab; href: string; emoji: string; label: string }[] = [
  { id: 'home', href: '/', emoji: '🏠', label: '今日' },
  { id: 'wants', href: '/wants', emoji: '★', label: 'チート' },
  { id: 'weight', href: '/weight', emoji: '⚖️', label: '体重' },
  { id: 'settings', href: '/settings', emoji: '⚙️', label: '設定' },
]

export function BottomNav({ active }: { active: Tab }) {
  const router = useRouter()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800 px-8 py-4 flex justify-around">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => {
            if (tab.id !== active) router.push(tab.href)
          }}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-xl">{tab.emoji}</span>
          <span className={`text-xs ${active === tab.id ? 'text-amber-400' : 'text-stone-600'}`}>
            {tab.label}
          </span>
        </button>
      ))}
    </nav>
  )
}
