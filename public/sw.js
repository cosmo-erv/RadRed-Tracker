/*
 * Tiny offline cache. The app shell is fetched network-first so a deploy is
 * picked up straight away; sprites and hashed build assets are cache-first
 * because they never change under the same URL.
 */
const CACHE = 'radred-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isDocument = request.mode === 'navigate'

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)

      if (isDocument) {
        try {
          const fresh = await fetch(request)
          cache.put('/index.html', fresh.clone())
          return fresh
        } catch {
          return (await cache.match('/index.html')) ?? Response.error()
        }
      }

      const hit = await cache.match(request)
      if (hit) return hit

      try {
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(request, fresh.clone())
        return fresh
      } catch {
        return Response.error()
      }
    })()
  )
})
