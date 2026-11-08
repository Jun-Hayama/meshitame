// ホーム画面に追加（PWA）するための最小限の Service Worker。
// キャッシュは一切しない：公開後に古い画面が残らないように、リクエストはそのままネットワークに流す。

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
