'use client'

import { useRouter } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'

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
            onClick={() => router.push('/setup')}
            className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🎯</span>
              <div className="text-left">
                <p className="text-sm font-medium text-stone-100">目標設定</p>
                <p className="text-stone-500 text-xs mt-0.5">目標体重・期間・ゲート</p>
              </div>
            </div>
            <span className="text-stone-600">›</span>
          </button>

          <button
            onClick={() => router.push('/wants')}
            className="w-full flex items-center justify-between bg-stone-900 rounded-2xl px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">★</span>
              <div className="text-left">
                <p className="text-sm font-medium text-stone-100">チートの登録</p>
                <p className="text-stone-500 text-xs mt-0.5">日付指定・毎週の頻度</p>
              </div>
            </div>
            <span className="text-stone-600">›</span>
          </button>
        </main>
      </div>

      <BottomNav active="settings" />
    </div>
  )
}
