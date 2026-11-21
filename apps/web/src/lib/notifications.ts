import { getAppVisibilityState, isAppFocused } from '@/lib/appVisibility'
import { getDeviceId } from '@/lib/deviceId'
import { logNotification, navigateFromNotification } from '@/lib/notificationNavigation'
import { type NotifSoundKind, playNotifSound } from '@/lib/sounds'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { notificationMessageTarget, notificationTag, type NotificationDismissal } from '@chat/shared'

export type { NotifSoundKind }
export { notificationTag }

type NotifSettings = {
  enabled: boolean
  soundEnabled: boolean
}

export function getNotifSettings(): NotifSettings {
  const s = useSettingsStore.getState()
  const suppressAll = useAuthStore.getState().user?.pushSuppressAll
  return {
    enabled: suppressAll == null ? s.notifEnabled : !suppressAll,
    soundEnabled: s.notifSoundEnabled
  }
}

export function useNotificationsEnabled(): boolean {
  const suppressAll = useAuthStore((s) => s.user?.pushSuppressAll)
  const localEnabled = useSettingsStore((s) => s.notifEnabled)
  return suppressAll == null ? localEnabled : !suppressAll
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

type AlertTarget = { url?: string; createdAt?: string; displayedAt: string }
const browserAlerts = new Map<Notification, AlertTarget>()
let desktopAlertOwner: string | undefined
const desktopAlerts = new Map<string, AlertTarget>()
const recentMessages = new Map<string, number>()

export function notificationsInDnd(): boolean {
  const user = useAuthStore.getState().user
  return !!user && user.status === 'dnd' &&
    (!user.manualStatusExpiresAt || Date.parse(user.manualStatusExpiresAt) > Date.now())
}

function desktopStorageKey() {
  return `jablu-desktop-alerts:${desktopAlertOwner}`
}

function loadDesktopAlerts() {
  const userId = useAuthStore.getState().user?.id
  if (desktopAlertOwner === userId) return
  desktopAlertOwner = userId
  desktopAlerts.clear()
  if (!userId) return
  try {
    const values = JSON.parse(localStorage.getItem(desktopStorageKey()) ?? '[]') as [string, AlertTarget][]
    for (const [tag, target] of values) desktopAlerts.set(tag, target)
  } catch { /* best-effort cleanup */ }
}

function saveDesktopAlerts() {
  if (!desktopAlertOwner) return
  try {
    localStorage.setItem(desktopStorageKey(), JSON.stringify([...desktopAlerts].slice(-100)))
  } catch { /* best-effort cleanup */ }
}

function matchesDismissal(target: AlertTarget, dismissal: NotificationDismissal): boolean {
  const { urls, throughAt, includeThreads } = dismissal
  const cutoff = throughAt ? Date.parse(throughAt) : undefined
  if (urls === null) return cutoff === undefined || Date.parse(target.displayedAt) <= cutoff
  if (!target.url) return false
  const targetUrl = target.url
  const tag = notificationTag(targetUrl)
  const message = notificationMessageTarget(targetUrl)
  return urls.some((url) => {
    if (notificationMessageTarget(url)) return url === targetUrl
    if (notificationTag(url) !== tag && !(includeThreads && message?.threadParentId && url === targetUrl.split('?')[0])) {
      return false
    }
    if (cutoff === undefined) return true
    const date = message ? target.createdAt : target.displayedAt
    return !!date && Date.parse(date) <= cutoff
  })
}

/**
 * Three cases, and the distinction matters:
 *
 * Focused windows show in-app toasts and tell the server that the alert was
 * presented. Unfocused windows use OS alerts. Web clients share the worker's
 * tag for each timeline so a background push can reuse the same slot.
 */
export function showNotification(
  title: string,
  body: string,
  url?: string,
  onClick?: () => void,
  soundKind: NotifSoundKind = 'message',
  createdAt?: string
) {
  const session = useAuthStore.getState()
  if (!session.isAuthenticated) return
  const isCurrent = () => {
    const current = useAuthStore.getState()
    return current.isAuthenticated && current.accessToken === session.accessToken && getNotifSettings().enabled && !notificationsInDnd()
  }
  const settings = getNotifSettings()
  if (!settings.enabled || notificationsInDnd()) return
  const target: AlertTarget = { url, createdAt, displayedAt: new Date().toISOString() }
  const message = notificationMessageTarget(url)
  if (message && url) {
    const key = `${session.user?.id}:${url}`
    const now = Date.now()
    if (now - (recentMessages.get(key) ?? -Infinity) < 60_000) return
    recentMessages.set(key, now)
    if (recentMessages.size > 200) recentMessages.delete(recentMessages.keys().next().value!)
  }

  if (isAppFocused()) {
    import('@/stores/toast.store').then(({ showToast }) => {
      if (isCurrent()) {
        showToast(title, body, url)
        if (message && isAppFocused()) {
          window.dispatchEvent(new CustomEvent('notification:presented', { detail: message.messageId }))
        }
      }
    })
    if (settings.soundEnabled) playNotifSound(soundKind)
    return
  }

  const tag = notificationTag(url)

  const { electronAPI } = window as unknown as {
    electronAPI?: { showNotification: (t: string, b: string, u?: string, tag?: string) => void }
  }
  if (electronAPI?.showNotification) {
    loadDesktopAlerts()
    if (tag) {
      desktopAlerts.delete(tag)
      desktopAlerts.set(tag, target)
      if (desktopAlerts.size > 100) desktopAlerts.delete(desktopAlerts.keys().next().value!)
      saveDesktopAlerts()
    }
    electronAPI.showNotification(title, body, url, tag)
    if (settings.soundEnabled) playNotifSound(soundKind)
    return
  }

  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const options: NotificationOptions = {
    body,
    icon: '/favicon-32x32.png',
    silent: true,
    tag
  }
  const showPersistent = async (registration: ServiceWorkerRegistration) => {
    if (!isCurrent()) return
    const previous = tag && typeof registration.getNotifications === 'function'
      ? await registration.getNotifications({ tag }) : []
    if (!isCurrent() || (message && previous.some((notification) => notification.data?.url === url))) return
    await registration.showNotification(title, { ...options, data: { ...target, url: url ?? '/' } })
  }
  // Unfocused web clients share the worker's notification namespace with push.
  if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) return showPersistent(registration)
      if (isCurrent()) showBrowserAlert()
    }).catch(() => {
      if (isCurrent()) showBrowserAlert()
    })
    if (settings.soundEnabled) playNotifSound(soundKind)
    return
  }
  if (showBrowserAlert() && settings.soundEnabled) playNotifSound(soundKind)

  function showBrowserAlert() {
    let notification: Notification
    try {
      notification = new Notification(title, options)
    } catch {
      return false
    }

    browserAlerts.set(notification, target)
    notification.onclose = () => browserAlerts.delete(notification)
    notification.onclick = () => {
      window.focus()
      if (onClick) onClick()
      else if (url) navigateFromNotification(url)
      notification.close()
      browserAlerts.delete(notification)
    }
    return true
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
export async function clearNotifications(urls: string[] | null, boundary: Omit<NotificationDismissal, 'urls'> = {}): Promise<void> {
  const dismissal = { urls, ...boundary }
  for (const [notification, target] of browserAlerts) {
    if (!matchesDismissal(target, dismissal)) continue
    browserAlerts.delete(notification)
    notification.close()
  }

  const { electronAPI } = window as unknown as {
    electronAPI?: { dismissNotification?: (tag: string) => Promise<void>; dismissAllNotifications?: () => Promise<void> }
  }
  if (electronAPI?.dismissNotification) {
    loadDesktopAlerts()
    if (urls === null && !boundary.throughAt) void electronAPI.dismissAllNotifications?.()?.catch(() => {})
    const tags = new Set<string>()
    for (const [tag, target] of desktopAlerts) {
      if (matchesDismissal(target, dismissal)) {
        tags.add(tag)
        desktopAlerts.delete(tag)
      }
    }
    for (const url of urls ?? []) {
      const tag = notificationTag(url)
      if (tag && !boundary.throughAt && !notificationMessageTarget(url) && !desktopAlerts.has(tag)) tags.add(tag)
    }
    for (const tag of tags) void electronAPI.dismissNotification(tag)?.catch(() => {})
    saveDesktopAlerts()
  }

  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await (navigator.serviceWorker.getRegistration?.() ?? navigator.serviceWorker.ready)
    if (!reg) return
    const open = await reg.getNotifications()
    for (const n of open) {
      const timestamp = (n as Notification & { timestamp?: number }).timestamp
      const target = { displayedAt: new Date(timestamp ?? 0).toISOString(), url: n.tag?.replace(/^jablu-/, ''), ...n.data }
      if (matchesDismissal(target, dismissal)) {
        n.close()
      }
    }
  } catch {
    // Notification cleanup is cosmetic; never let it break the caller.
  }
}

let reconciliation: Promise<void> | null = null
export function reconcileNotifications(): Promise<void> {
  if (reconciliation) return reconciliation
  const userId = useAuthStore.getState().user?.id
  if (!userId) return Promise.resolve()
  reconciliation = (async () => {
    loadDesktopAlerts()
    const targets = [...desktopAlerts.values(), ...browserAlerts.values()].map(({ url }) => url)
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration?.()
      if (registration) targets.push(...(await registration.getNotifications()).map((alert) => alert.data?.url))
    }
    if (useAuthStore.getState().user?.id !== userId) return
    const urls = [...new Set(targets.filter((url): url is string => !!notificationMessageTarget(url)))]
    if (!urls.length) return
    const { api } = await import('@/lib/api')
    for (let index = 0; index < urls.length; index += 100) {
      const result = await api.reconcileMessageAlerts(urls.slice(index, index + 100))
      if (useAuthStore.getState().user?.id !== userId) return
      if (result.urls.length) await clearNotifications(result.urls)
    }
  })().catch(() => { /* retry on the next connection or resume */ }).finally(() => { reconciliation = null })
  return reconciliation
}

/** True when the app is on screen. */
export function isAppVisible(): boolean {
  return getAppVisibilityState().visibility === 'visible'
}

export function playSound(kind: NotifSoundKind = 'message') {
  const settings = getNotifSettings()
  if (!settings.enabled || !settings.soundEnabled || notificationsInDnd()) return
  playNotifSound(kind)
}

// ─── Web Push Subscription ─────────────────────────────────────

let pushRegistration: { token: string; locale: string } | null = null
let pushRevision = 0
let pushQueue: Promise<unknown> = Promise.resolve()
let activePushRequest: AbortController | null = null

// Serialize browser subscription changes across logout/login and Settings.
function queuePush<T>(run: () => Promise<T>): Promise<T> {
  const result = pushQueue.then(run)
  pushQueue = result.catch(() => {})
  return result
}

async function pushFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  activePushRequest = controller
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    if (activePushRequest === controller) activePushRequest = null
  }
}

async function getVapidKey(): Promise<string | null> {
  try {
    const resp = await pushFetch('/api/push/vapid-key')
    if (!resp.ok) return null
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
export async function subscribeToPush(token: string, promptForPermission = false, force = false): Promise<boolean> {
  const locale = useSettingsStore.getState().locale
  const revision = pushRevision
  const isCurrent = () => {
    const session = useAuthStore.getState()
    return revision === pushRevision && session.isAuthenticated && session.accessToken === token && getNotifSettings().enabled
  }
  if (!isCurrent()) return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false

  if (Notification.permission === 'denied') return false
  if (Notification.permission === 'default') {
    if (!promptForPermission) return false
    const result = await Notification.requestPermission()
    if (result !== 'granted') return false
  }

  return queuePush(async () => {
    if (!isCurrent()) return false
    // Unlike `ready`, this also settles when no worker has been installed yet.
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg?.active || !isCurrent()) return false
    let sub = await reg.pushManager.getSubscription()

    if (!isCurrent()) return false
    if (
      sub &&
      !promptForPermission &&
      !force &&
      pushRegistration?.token === token &&
      pushRegistration.locale === locale
    )
      return true
    pushRegistration = null
    const vapidKey = await getVapidKey()
    if (!vapidKey || !isCurrent()) return false
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
      })
    }

    if (!isCurrent()) return false
    const subJson = sub.toJSON()
    const response = await pushFetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: subJson.keys?.p256dh ?? '',
        auth: subJson.keys?.auth ?? '',
        deviceId: getDeviceId(),
        locale
      })
    })

    if (!isCurrent()) return false
    if (!response.ok) throw new Error(`Push registration failed (HTTP ${response.status})`)
    pushRegistration = { token, locale }
    return true
  })
}

export async function unsubscribeFromPush(token?: string): Promise<void> {
  ++pushRevision
  pushRegistration = null
  activePushRequest?.abort()
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  return queuePush(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return

    // Stop delivery on this device even offline or with an expired access token.
    // Server cleanup must never prevent the browser from revoking its endpoint.
    try {
      await sub.unsubscribe()
    } finally {
      if (token) {
        await pushFetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ endpoint: sub.endpoint })
        }).catch(() => {})
      }
    }
  })
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
