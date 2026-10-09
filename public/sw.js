// Bumped when the cache policy changes so existing clients do not retain a
// shell or asset cache created by the previous deployment strategy.
const CACHE = 'wintrack-v8'
const PRECACHE = [
  '/', '/index.html', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    } catch (e) { /* ignore */ }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch (e) { return }
  if (url.origin !== self.location.origin) return

  // Navigations: network-first, fall back to cached shell when offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        try {
          // Never cache an error page as the offline shell.
          if (res.ok) {
            const cache = await caches.open(CACHE)
            cache.put('/index.html', res.clone())
          }
        } catch (e) { /* ignore */ }
        return res
      } catch (e) {
        const cached = await caches.match('/index.html')
        return cached || Response.error()
      }
    })())
    return
  }

  // Static assets + icons: network-first with cache fallback. Hashed assets
  // remain available offline, while a deployment can immediately replace a
  // stale chunk instead of serving an old copy indefinitely.
  const cacheable = url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    /\/(icon-192|icon-512|apple-touch-icon)\.png$/.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest'
  if (!cacheable) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      const fresh = await fetch(req)
      if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {})
      return fresh.ok ? fresh : (await cache.match(req)) || fresh
    } catch (e) {
      return (await cache.match(req)) || Response.error()
    }
  })())
})
