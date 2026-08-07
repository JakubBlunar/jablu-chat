import { desktopAPI, isDesktop } from '@/lib/desktop'

/**
 * Whether the app is *on screen*, which is a different question from whether it
 * holds keyboard focus.
 *
 * Push delivery keys off visibility, not focus: Jablu open on a second monitor
 * while you work in another window still means you will see the message, so the
 * server should not wake your phone. Only `hidden` — tray, minimised, background
 * tab, screen off — hands delivery back to push.
 *
 * On desktop the browser's own `visibilityState` is unreliable for a window
 * hidden to the tray, so the native window state reported by Tauri wins.
 */
export type AppVisibility = 'visible' | 'hidden'

export type AppVisibilityState = {
  visibility: AppVisibility
  focused: boolean
}

type Listener = (state: AppVisibilityState) => void

const listeners = new Set<Listener>()

/** Latest native window state on desktop; null until the shell reports one. */
let desktopWindow: { visible: boolean; minimized: boolean; focused: boolean } | null = null

function computeState(): AppVisibilityState {
  if (isDesktop && desktopWindow) {
    return {
      visibility: desktopWindow.visible && !desktopWindow.minimized ? 'visible' : 'hidden',
      focused: desktopWindow.focused
    }
  }
  if (typeof document === 'undefined') return { visibility: 'hidden', focused: false }
  return {
    visibility: document.visibilityState === 'visible' ? 'visible' : 'hidden',
    focused: document.hasFocus()
  }
}

/** Last published value, kept only to suppress duplicate listener calls. */
let current: AppVisibilityState = computeState()

function publish() {
  const next = computeState()
  if (next.visibility === current.visibility && next.focused === current.focused) return
  current = next
  for (const listener of listeners) listener(next)
}

/**
 * Recomputed on every call rather than served from `current`. Reading the
 * document is cheap, and a stale answer here means either a missing OS toast or
 * a duplicate one — both worse than the read.
 */
export function getAppVisibilityState(): AppVisibilityState {
  return computeState()
}

/** True when the user is looking directly at the app and an OS toast would be noise. */
export function isAppFocused(): boolean {
  const state = computeState()
  return state.focused && state.visibility === 'visible'
}

export function subscribeAppVisibility(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let started = false

/** Wires the platform sources. Safe to call more than once. */
export function startAppVisibilityTracking(): () => void {
  if (started) return () => {}
  started = true

  const cleanups: (() => void)[] = []

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', publish)
    window.addEventListener('focus', publish)
    window.addEventListener('blur', publish)
    cleanups.push(() => {
      document.removeEventListener('visibilitychange', publish)
      window.removeEventListener('focus', publish)
      window.removeEventListener('blur', publish)
    })
  }

  if (isDesktop && desktopAPI) {
    void desktopAPI
      .getWindowState()
      .then((state) => {
        desktopWindow = state
        publish()
      })
      .catch(() => {})

    cleanups.push(
      desktopAPI.onWindowState((state) => {
        desktopWindow = state
        publish()
      })
    )
  }

  current = computeState()

  return () => {
    for (const cleanup of cleanups) cleanup()
    started = false
  }
}
