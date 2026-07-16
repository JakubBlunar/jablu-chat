import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PttBinding } from '@/lib/micMode'

/** True when running inside the Tauri desktop shell. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export type DesktopAPI = {
  isElectron: true
  platform: string
  appVersion: string
  /** Kept for API parity; screen sharing on desktop uses the standard web getDisplayMedia path. */
  getSources: () => Promise<
    Array<{ id: string; name: string; thumbnail: string; appIcon: string | null }>
  >
  showNotification: (title: string, body: string, url?: string) => Promise<void>
  restartApp: () => Promise<void>
  onNavigate: (cb: (url: string) => void) => () => void
  setTrayUnread: (count: number) => Promise<void>
  setServerUrl: (url: string) => Promise<void>
  testServerUrl: (url: string) => Promise<{ ok: boolean }>
  getAutoLaunch: () => Promise<boolean>
  setAutoLaunch: (enabled: boolean) => Promise<boolean>
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  getUpdateStatus: () => Promise<{
    lastCheckedAt: number | null
    lastError: string | null
    feedConfigured: boolean
  }>
  onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void
  onUpdateNotAvailable: (cb: () => void) => () => void
  onUpdateDownloadProgress: (
    cb: (progress: { percent: number; transferred: number; total: number }) => void
  ) => () => void
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void
  onUpdateError: (cb: (err: { message: string }) => void) => () => void
  onUpdateIncompatible: (
    cb: (info: {
      reason: 'client-too-old' | 'client-too-new' | null
      minClient: string
      maxClient: string | null
    }) => void
  ) => () => void
  // Global push-to-talk (desktop only)
  setPttBinding: (binding: PttBinding) => Promise<void>
  clearPtt: () => Promise<void>
  onPtt: (cb: (state: 'down' | 'up') => void) => () => void
}

/** Subscribe to a Tauri event, returning a synchronous unsubscribe function. */
function on<T>(event: string, cb: (payload: T) => void): () => void {
  let unlisten: (() => void) | null = null
  let cancelled = false
  void listen<T>(event, (e) => cb(e.payload)).then((fn) => {
    if (cancelled) fn()
    else unlisten = fn
  })
  return () => {
    cancelled = true
    unlisten?.()
  }
}

let cachedVersion = ''
let cachedPlatform = 'win32'

function buildDesktopAPI(): DesktopAPI {
  // Populate sync-read fields (appVersion/platform) in the background.
  void invoke<string>('get_version').then((v) => {
    cachedVersion = v
  })
  void invoke<string>('get_platform').then((p) => {
    cachedPlatform = p
  })

  return {
    isElectron: true,
    get platform() {
      return cachedPlatform
    },
    get appVersion() {
      return cachedVersion
    },
    getSources: () => Promise.resolve([]),
    showNotification: (title, body, url) => invoke('show_notification', { title, body, url }),
    restartApp: () => invoke('restart_app'),
    onNavigate: (cb) => on<string>('navigate', (url) => cb(url)),
    setTrayUnread: (count) => invoke('set_tray_unread', { count }),
    setServerUrl: (url) => invoke('set_server_url', { url }),
    testServerUrl: async (url) => ({ ok: await invoke<boolean>('test_server_url', { url }) }),
    getAutoLaunch: () => invoke<boolean>('get_auto_launch'),
    setAutoLaunch: (enabled) => invoke<boolean>('set_auto_launch', { enabled }),
    checkForUpdates: () => invoke('check_for_updates'),
    installUpdate: () => invoke('install_update'),
    getUpdateStatus: () =>
      invoke('get_update_status') as Promise<{
        lastCheckedAt: number | null
        lastError: string | null
        feedConfigured: boolean
      }>,
    onUpdateAvailable: (cb) => on<{ version: string }>('update-available', cb),
    onUpdateNotAvailable: (cb) => on<null>('update-not-available', () => cb()),
    onUpdateDownloadProgress: (cb) =>
      on<{ percent: number; transferred: number; total: number }>('update-download-progress', cb),
    onUpdateDownloaded: (cb) => on<{ version: string }>('update-downloaded', cb),
    onUpdateError: (cb) => on<{ message: string }>('update-error', cb),
    onUpdateIncompatible: (cb) =>
      on<{
        reason: 'client-too-old' | 'client-too-new' | null
        minClient: string
        maxClient: string | null
      }>('update-incompatible', cb),
    setPttBinding: (binding) => invoke('set_ptt_binding', { binding }),
    clearPtt: () => invoke('clear_ptt'),
    onPtt: (cb) => {
      const offDown = on<null>('ptt:down', () => cb('down'))
      const offUp = on<null>('ptt:up', () => cb('up'))
      return () => {
        offDown()
        offUp()
      }
    }
  }
}

export const desktopAPI: DesktopAPI | undefined = isDesktop ? buildDesktopAPI() : undefined

// Expose under the legacy `window.electronAPI` name so existing code paths that
// read the bridge directly off `window` (e.g. notifications) keep working.
if (desktopAPI) {
  ;(window as unknown as { electronAPI?: DesktopAPI }).electronAPI = desktopAPI
}
