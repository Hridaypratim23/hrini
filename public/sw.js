// HRINI Service Worker

const CACHE = 'hrini-v1'
const STATIC_ASSETS = [
  '/photos/engagement/DSC05787.jpg',
  '/photos/engagement/DSC05793.jpg',
  '/photos/engagement/DSC05736.jpg',
  '/photos/engagement/DSC05773.jpg',
  '/photos/engagement/DSC05727.jpg',
  '/photos/engagement/DSC05317.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Cache-first for images, network-first for everything else
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  const isImage = /\.(jpe?g|png|webp|svg|gif)$/i.test(url.pathname)
  if (!isImage) return

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((cache) => cache.put(e.request, clone))
        }
        return res
      })
    })
  )
})

self.addEventListener('push', (e) => {
  if (!e.data) return
  const data = e.data.json()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const isVisible = clients.some((c) => c.visibilityState === 'visible')

      // Always update the app icon badge count (minimum 1 for any push)
      if ('setAppBadge' in navigator) {
        navigator.setAppBadge(data.badge > 0 ? data.badge : 1).catch(() => {})
      }

      // Suppress notification banner if app is in the foreground
      if (isVisible) return
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        vibrate: [200, 100, 200],
        data: { url: data.url || '/home' },
        actions: data.actions || [],
      })
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/home'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url))
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    })
  )
})
