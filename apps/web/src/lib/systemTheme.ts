import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'

export type SystemTheme = 'light' | 'dark'
const QUERY = '(prefers-color-scheme: light)'
const listeners = new Set<() => void>()
let nativeTheme: SystemTheme | null = null
let stop: (() => void) | null = null

export function getSystemTheme(): SystemTheme {
  return nativeTheme ?? (window.matchMedia?.(QUERY).matches ? 'light' : 'dark')
}

/** WebView media queries can miss Windows appearance changes; use the shell too. */
export function subscribeSystemTheme(listener: () => void): () => void {
  listeners.add(listener)
  if (!stop) {
    let disposed = false
    let revision = 0
    let unlisten: (() => void) | undefined
    const media = window.matchMedia?.(QUERY)
    const publish = () => listeners.forEach((notify) => notify())
    const shell = '__TAURI_INTERNALS__' in window ? getCurrentWindow() : null
    const refresh = () => {
      if (disposed) return
      publish()
      if (!shell) return
      const request = ++revision
      void invoke<SystemTheme | null>('get_system_theme')
        .then((theme) => theme ?? shell.theme())
        .catch(() => shell.theme()) // Compatibility with older desktop shells.
        .then((theme) => {
          if (disposed || request !== revision || !theme) return
          nativeTheme = theme
          publish()
        })
        .catch(() => {})
    }
    const onMediaChange = () => {
      if (!shell) publish()
      else refresh()
    }
    media?.addEventListener('change', onMediaChange)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    // A scheduled OS switch may deliver neither a native nor a media event.
    const poll = shell ? window.setInterval(refresh, 30_000) : undefined
    if (shell) {
      // Subscribe before the initial read, and ignore reads older than an event.
      void shell
        .onThemeChanged(({ payload }) => {
          if (disposed) return
          ++revision
          nativeTheme = payload
          publish()
          refresh()
        })
        .then((off) => {
          if (disposed) off()
          else {
            unlisten = off
            refresh()
          }
        })
        .catch(refresh)
    }
    stop = () => {
      disposed = true
      unlisten?.()
      clearInterval(poll)
      media?.removeEventListener('change', onMediaChange)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
      nativeTheme = null
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stop?.()
      stop = null
    }
  }
}
