/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { notificationTag } from '@chat/shared'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/api\//, /^\/socket\.io\//]
}))

// Hashed optional chunks remain available offline after their first use. Keep
// this cache across worker updates so an existing tab can finish using its build.
registerRoute(
  ({ url }) => url.origin === self.location.origin && /^\/assets\/.*\.(?:js|css)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'optional-feature-assets',
    plugins: [
      { cacheWillUpdate: async ({ response }) => response.status === 200 &&
        /(?:javascript|text\/css)/i.test(response.headers.get('content-type') ?? '') ? response : null },
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 })
    ]
  })
)

// Cache MediaPipe WASM, models, and JS on first use (CacheFirst — they're versioned by path)
registerRoute(
  ({ url }) => url.pathname.startsWith('/mediapipe-'),
  new CacheFirst({
    cacheName: 'mediapipe-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 })]
  })
)

// Public UUID media has immutable URLs. Range responses stay on the HTTP path:
// caching a partial video response as if it were the whole file breaks playback.
registerRoute(
  ({ url, request }) => url.origin === self.location.origin && !request.headers.has('range') &&
    /^\/(?:api\/)?uploads\/(?:avatars|attachments|thumbnails|emoji|activity-icons)\/[^/]+$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'uploads-cache',
    plugins: [
      { cacheWillUpdate: async ({ response }) => response.status === 200 ? response : null },
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
)

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const payload = event.data.json() as {
      title?: string
      body?: string
      url?: string
      expiresAt?: number
    }

    if (typeof payload.expiresAt === 'number' && payload.expiresAt <= Date.now()) return

    const title = payload.title ?? 'Jablu'
    const notifUrl = payload.url ?? '/'
    const options: NotificationOptions & { renotify?: boolean } = {
      body: payload.body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/favicon-32x32.png',
      data: { url: notifUrl },
      tag: notificationTag(notifUrl),
      renotify: true
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch (_err) {
    event.waitUntil(
      self.registration.showNotification('Jablu', {
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
