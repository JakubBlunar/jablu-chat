/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Cache MediaPipe WASM, models, and JS on first use (CacheFirst — they're versioned by path)
registerRoute(
  ({ url }) => url.pathname.startsWith('/mediapipe-'),
  new CacheFirst({
    cacheName: 'mediapipe-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 })]
  })
)

// API calls: always hit the network (never serve stale authenticated data)
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly())

// Uploaded files: cache first (content-addressed)
registerRoute(
  ({ url }) => url.pathname.startsWith('/uploads/'),
  new CacheFirst({
    cacheName: 'uploads-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })]
  })
)

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const payload = event.data.json() as {
      title?: string
      body?: string
      url?: string
    }

    const title = payload.title ?? 'Jablu'
    const notifUrl = payload.url ?? '/'
    const options: NotificationOptions = {
      body: payload.body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/favicon-32x32.png',
      data: { url: notifUrl },
      tag: `jablu-${notifUrl}`,
      renotify: true
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch (err) {
    event.waitUntil(
      self.registration.showNotification('Jablu', {
        body: 'You have a new notification',
        icon: '/pwa-192x192.png'
      })
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const rawUrl = (event.notification.data as { url?: string })?.url ?? '/'
  const parsed = new URL(rawUrl, self.location.origin)
  if (parsed.origin !== self.location.origin) return
  const absoluteUrl = parsed.href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin !== self.location.origin) continue
        const wc = client as WindowClient
        try {
          const focused = await wc.focus()
          await focused.navigate(absoluteUrl)
          return
        } catch {
          try {
            wc.postMessage({ type: 'navigate', url: rawUrl })
            return
          } catch {
            /* fall through to openWindow */
          }
        }
      }
      return self.clients.openWindow(absoluteUrl)
    })
  )
})
