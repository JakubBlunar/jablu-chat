/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cache MediaPipe WASM, models, and JS on first use (CacheFirst — they're versioned by path)
registerRoute(
  ({ url }) => url.pathname.startsWith("/mediapipe-"),
  new CacheFirst({
    cacheName: "mediapipe-assets",
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 }),
    ],
  }),
);

// API calls: network first with short timeout
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api-cache",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 5 }),
    ],
  }),
);

// Uploaded files: cache first (content-addressed)
registerRoute(
  ({ url }) => url.pathname.startsWith("/uploads/"),
  new CacheFirst({
    cacheName: "uploads-cache",
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json() as {
      title?: string;
      body?: string;
      url?: string;
    };

    const title = payload.title ?? "Jablu";
    const options: NotificationOptions = {
      body: payload.body ?? "",
      icon: "/pwa-192x192.png",
      badge: "/favicon-32x32.png",
      data: { url: payload.url ?? "/" },
      tag: `jablu-${Date.now()}`,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    event.waitUntil(
      self.registration.showNotification("Jablu", {
        body: "You have a new notification",
        icon: "/pwa-192x192.png",
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data as { url?: string })?.url ?? "/";
  const absoluteUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        const wc = client as WindowClient;
        try {
          const focused = await wc.focus();
          await focused.navigate(absoluteUrl);
          return;
        } catch {
          try {
            wc.postMessage({ type: "navigate", url: rawUrl });
            return;
          } catch { /* fall through to openWindow */ }
        }
      }
      return self.clients.openWindow(absoluteUrl);
    }),
  );
});
