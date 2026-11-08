'use client'

import { useEffect } from 'react'

// public/sw.js を登録する（キャッシュしない最小限のもの）。sw.js 自体もHTTPキャッシュを使わずに更新を確認する
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // 登録できなくてもアプリは普通に使えるので、何もしない
    })
  }, [])

  return null
}
