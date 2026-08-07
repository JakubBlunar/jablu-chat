import { getAppVisibilityState, isAppFocused } from '@/lib/appVisibility'
import { getDeviceId } from '@/lib/deviceId'
import { logNotification, navigateFromNotification } from '@/lib/notificationNavigation'
import { type NotifSoundKind, playNotifSound } from '@/lib/sounds'
import { useSettingsStore } from '@/stores/settings.store'

export type { NotifSoundKind }

type NotifSettings = {
  enabled: boolean
  soundEnabled: boolean
}

export function getNotifSettings(): NotifSettings {
  const s = useSettingsStore.getState()
  return {
    enabled: s.notifEnabled,
    soundEnabled: s.notifSoundEnabled
  }
}

export function saveNotifSettings(p: Partial<NotifSettings>) {
  useSettingsStore.getState().patchNotifSettings({
    enabled: p.enabled,
    soundEnabled: p.soundEnabled
  })
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** Shared with the service worker so the OS collapses duplicates into one toast. */
export function notificationTag(url?: string): string | undefined {
  return url ? `jablu-${url}` : undefined
}

/**
 * Three cases, and the distinction matters:
 *
 * - **Focused** — the user is reading this window. An in-app toast is enough; an
 *   OS toast would be noise.
 * - **Visible but unfocused** — Jablu on a second monitor. An OS toast, because
 *   the server will not push to their other devices while this session is visible.
 * - **Hidden** — tray, minimised, background tab. Also an OS toast, and the server
 *   pushes as well; the shared `tag` makes the OS show only one of the two.
 */
export function showNotification(
  title: string,
  body: string,
  url?: string,
  onClick?: () => void,
  soundKind: NotifSoundKind = 'message'
) {
  const settings = getNotifSettings()
  if (!settings.enabled) return

  if (isAppFocused()) {
    import('@/stores/toast.store').then(({ showToast }) => showToast(title, body, url))
    if (settings.soundEnabled) playNotifSound(soundKind)
    return
  }

  const tag = notificationTag(url)

  const { electronAPI } = window as unknown as {
    electronAPI?: { showNotification: (t: string, b: string, u?: string, tag?: string) => void }
  }
  if (electronAPI?.showNotification) {
    electronAPI.showNotification(title, body, url, tag)
    if (settings.soundEnabled) playNotifSound(soundKind)
    return
  }

  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const n = new Notification(title, {
    body,
    icon: '/favicon-32x32.png',
    silent: true,
    tag
  })

  n.onclick = () => {
    window.focus()
    if (onClick) {
      onClick()
    } else if (url) {
      navigateFromNotification(url)
    }
    n.close()
  }

  if (settings.soundEnabled) {
    playNotifSound(soundKind)
  }
}

/**
 * Takes down OS notifications the user has already dealt with elsewhere.
 *
 * Reaches all three places a toast can live — the page's own `Notification`
 * objects, the service worker's (which survive a closed tab), and the Windows
 * Action Center via the desktop shell. Passing `null` clears everything, which
 * is what mark-all-read does.
 */
export async function clearNotifications(urls: string[] | null): Promise<void> {
  const tags = urls?.map((u) => notificationTag(u)).filter((t): t is string => !!t) ?? null

  const { electronAPI } = window as unknown as {
    electronAPI?: { dismissNotification?: (tag: string) => void }
  }
  if (electronAPI?.dismissNotification && tags) {
    for (const tag of tags) electronAPI.dismissNotification(tag)
  }

  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    // `getNotifications` with no filter is the only way to reach ones this page
    // never created, so always fetch all and filter locally.
    const open = await reg.getNotifications()
    for (const n of open) {
      if (tags === null || (n.tag && tags.includes(n.tag))) {
        n.close()
        electronAPI?.dismissNotification?.(n.tag)
      }
    }
  } catch {
    // Notification cleanup is cosmetic; never let it break the caller.
  }
}

/** True when the app is on screen; the server will not push to other devices. */
export function isAppVisible(): boolean {
  return getAppVisibilityState().visibility === 'visible'
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

/**
 * @param promptForPermission Whether it is safe to ask for permission. Only true
 *   when called from a user gesture: iOS Safari silently rejects
 *   `requestPermission()` outside one, which would burn the prompt for good.
 */
export async function subscribeToPush(token: string, promptForPermission = false): Promise<void> {
  if (pushSubscribed) return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  if (Notification.permission === 'denied') return
  if (Notification.permission === 'default') {
    if (!promptForPermission) return
    const result = await Notification.requestPermission()
    if (result !== 'granted') return
  }

  try {
    const vapidKey = await getVapidKey()
    if (!vapidKey) return

    const regs = await navigator.serviceWorker.getRegistrations()
    if (regs.length === 0) return

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
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
        auth: subJson.keys?.auth ?? '',
        deviceId: getDeviceId()
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
    const regs = await navigator.serviceWorker.getRegistrations()
    if (regs.length === 0) return

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
      logNotification('service worker click received', event.data.url)
      navigateFromNotification(event.data.url)
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

  logNotification('desktop navigate listener installed')
  return electronAPI.onNavigate((url: string) => {
    logNotification('desktop toast click received', url)
    navigateFromNotification(url)
  })
}
