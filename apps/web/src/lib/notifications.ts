const NOTIF_SETTINGS_KEY = 'jablu-notif-settings'

type NotifSettings = {
  enabled: boolean
  soundEnabled: boolean
}

const defaults: NotifSettings = { enabled: true, soundEnabled: true }

export function getNotifSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem(NOTIF_SETTINGS_KEY)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

export function saveNotifSettings(s: Partial<NotifSettings>) {
  const current = getNotifSettings()
  localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify({ ...current, ...s }))
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

import { type NotifSoundKind, playNotifSound } from '@/lib/sounds'

export type { NotifSoundKind }

export function showNotification(
  title: string,
  body: string,
  url?: string,
  onClick?: () => void,
  soundKind: NotifSoundKind = 'message'
) {
  const settings = getNotifSettings()
  if (!settings.enabled) return

  if (document.hasFocus()) {
    import('@/stores/toast.store').then(({ showToast }) => showToast(title, body, url))
    if (settings.soundEnabled) playNotifSound(soundKind)
    return
  }

  const { electronAPI } = window as unknown as {
    electronAPI?: { showNotification: (t: string, b: string, u?: string) => void }
  }
  if (electronAPI?.showNotification) {
    electronAPI.showNotification(title, body, url)
    if (settings.soundEnabled) playNotifSound(soundKind)
    return
  }

  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const n = new Notification(title, {
    body,
    icon: '/favicon-32x32.png',
    silent: true
  })

  n.onclick = () => {
    window.focus()
    if (onClick) {
      onClick()
    } else if (url) {
      window.location.href = new URL(url, window.location.origin).href
    }
    n.close()
  }

  if (settings.soundEnabled) {
    playNotifSound(soundKind)
  }
}

export function playSound(kind: NotifSoundKind = 'message') {
  const settings = getNotifSettings()
  if (!settings.soundEnabled) return
  playNotifSound(kind)
}

// ─── Web Push Subscription ─────────────────────────────────────

let pushSubscribed = false

async function getVapidKey(): Promise<string | null> {
  try {
    const resp = await fetch('/api/push/vapid-key')
    const data = await resp.json()
    return data.key ?? null
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function subscribeToPush(token: string): Promise<void> {
  if (pushSubscribed) return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  if (Notification.permission === 'denied') return
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission()
    if (result !== 'granted') return
  }

  try {
    const vapidKey = await getVapidKey()
    if (!vapidKey) return

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      })
    }

    const subJson = sub.toJSON()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: subJson.keys?.p256dh ?? '',
        auth: subJson.keys?.auth ?? ''
      })
    })

    pushSubscribed = true
  } catch {
    // Push subscription failed -- non-critical
  }
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return

    await fetch('/api/push/unsubscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ endpoint: sub.endpoint })
    })

    await sub.unsubscribe()
    pushSubscribed = false
  } catch {
    // Unsubscribe failed -- non-critical
  }
}

export function setupPushNavigation(): (() => void) | undefined {
  if (!('serviceWorker' in navigator)) return

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'navigate' && typeof event.data.url === 'string') {
      const target = new URL(event.data.url, window.location.origin)
      if (target.origin === window.location.origin) {
        window.location.href = target.href
      }
    }
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}

export function setupElectronNavigation() {
  const { electronAPI } = window as unknown as {
    electronAPI?: { onNavigate?: (cb: (url: string) => void) => () => void }
  }
  if (!electronAPI?.onNavigate) return

  return electronAPI.onNavigate((url: string) => {
    window.location.hash = `#${url}`
  })
}
