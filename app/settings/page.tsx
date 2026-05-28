'use client'

import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24">
      <div className="max-w-md mx-auto">
        <header className="px-5 pt-12 pb-6">
          <h1 className="text-xl font-bold">設定</h1>
        </header>

        <main className="px-5 space-y-3">
          <button
            onClick={() => router.push('/settings/profile')}
            className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">👤</span>
              <div className="text-left">
                <p className="text-sm font-medium text-stone-100">プロフィール・カロリー設定</p>
                <p className="text-stone-500 text-xs mt-0.5">身長・体重・活動量</p>
              </div>
            </div>
            <span className="text-stone-600">›</span>
          </button>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800 px-8 py-4 flex justify-around">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-1">
          <span className="text-xl">🏠</span>
          <span className="text-xs text-stone-600">今日</span>
        </button>
        <button onClick={() => router.push('/plan')} className="flex flex-col items-center gap-1">
          <span className="text-xl">📅</span>
          <span className="text-xs text-stone-600">週プラン</span>
        </button>
        <button onClick={() => router.push('/weight')} className="flex flex-col items-center gap-1">
          <span className="text-xl">⚖️</span>
          <span className="text-xs text-stone-600">体重</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <span className="text-xl">⚙️</span>
          <span className="text-xs text-amber-400">設定</span>
        </button>
      </nav>
    </div>
  )
}
