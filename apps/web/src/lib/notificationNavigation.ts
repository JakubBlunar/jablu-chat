/**
 * Navigation used by notification clicks, deliberately decoupled from React.
 *
 * Toast handlers live outside the component tree (a service-worker message, a
 * Tauri event, a `Notification.onclick`), so they cannot call `useNavigate`. The
 * previous approach — assigning `window.location.hash` — bypassed the router and,
 * worse, was a silent no-op when the hash already matched, which is exactly the
 * case when you click a toast for the channel you are already on.
 */

type Navigator = (to: string) => void

let navigateRef: Navigator | null = null

/** Installed by the bridge component rendered inside the Router. */
export function setNotificationNavigator(fn: Navigator | null): void {
  navigateRef = fn
}

export function navigateFromNotification(url: string): void {
  const path = normalizePath(url)
  if (!path) return

  if (navigateRef) {
    logNotification('navigate via router', path)
    navigateRef(path)
    return
  }

  // Before the router mounts (cold start from a toast click), fall through to the
  // hash. Reassigning the same hash does nothing, so force a reload in that case.
  logNotification('navigate via hash fallback', path)
  const target = `#${path}`
  if (window.location.hash === target) {
    window.location.reload()
  } else {
    window.location.hash = target
  }
}

/**
 * Accepts the shapes notifications carry: an app path, a full same-origin URL, or
 * a hash-router URL. Cross-origin targets are rejected.
 */
function normalizePath(url: string): string | null {
  if (!url) return null
  if (url.startsWith('/')) return url

  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin !== window.location.origin) return null
    if (parsed.hash.startsWith('#/')) return parsed.hash.slice(1)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}

/** Traces the notification click path, which spans processes and is otherwise opaque. */
export function logNotification(stage: string, detail?: unknown): void {
  if (detail === undefined) console.info(`[notif] ${stage}`)
  else console.info(`[notif] ${stage}:`, detail)
}
