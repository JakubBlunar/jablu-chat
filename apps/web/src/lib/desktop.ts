import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { DetectedActivity } from '@chat/shared'
import type { PttBinding } from '@/lib/micMode'

/** True when running inside the Tauri desktop shell. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Native window state. `visible` is false while hidden to the tray, which the
 * webview's own `document.visibilityState` does not reliably report.
 */
export type DesktopWindowState = {
  visible: boolean
  minimized: boolean
  focused: boolean
}

/** Snapshot of the native updater. `pendingVersion` is set once the installer is downloaded. */
export type DesktopUpdateStatus = {
  lastCheckedAt: number | null
  lastError: string | null
  feedConfigured: boolean
  pendingVersion: string | null
  availableVersion: string | null
}

export type DesktopAPI = {
  isElectron: true
  platform: string
  appVersion: string
  /** Kept for API parity; screen sharing on desktop uses the standard web getDisplayMedia path. */
  getSources: () => Promise<
    Array<{ id: string; name: string; thumbnail: string; appIcon: string | null }>
  >
  /** `tag` groups repeat toasts for the same channel so they can be replaced and dismissed. */
  showNotification: (title: string, body: string, url?: string, tag?: string) => Promise<void>
  restartApp: () => Promise<void>
  onNavigate: (cb: (url: string) => void) => () => void
  getWindowState: () => Promise<DesktopWindowState>
  onWindowState: (cb: (state: DesktopWindowState) => void) => () => void
  setTrayUnread: (count: number) => Promise<void>
  /** Removes a previously shown toast from the Action Center by tag. */
  dismissNotification: (tag: string) => Promise<void>
  getAutoLaunch: () => Promise<boolean>
  setAutoLaunch: (enabled: boolean) => Promise<boolean>
  getStartMinimized: () => Promise<boolean>
  setStartMinimized: (enabled: boolean) => Promise<void>
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  getUpdateStatus: () => Promise<DesktopUpdateStatus>
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
  /** Fires when the global PTT listener fails to start (e.g. blocked hook). */
  onPttError: (cb: (message: string) => void) => () => void
  // Activity detection (desktop only)
  /** Enable/disable the native detection poll loop. */
  setActivityDetectionEnabled: (enabled: boolean) => Promise<void>
  /** Push the user's registered executables so custom apps become detectable. */
  setCustomDetectables: (
    detectables: { name: string; executables: string[] }[]
  ) => Promise<void>
  /** Read the currently detected activities on demand. */
  getDetectedActivities: () => Promise<DetectedActivity[]>
  /** Subscribe to detected-activity updates emitted by the native poll loop. */
  onActivityDetected: (cb: (activities: DetectedActivity[]) => void) => () => void
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
    showNotification: (title, body, url, tag) =>
      invoke('show_notification', { title, body, url, tag }),
    restartApp: () => invoke('restart_app'),
    onNavigate: (cb) => on<string>('navigate', (url) => cb(url)),
    getWindowState: () =>
      invoke<DesktopWindowState>('get_window_state').catch(() => ({
        visible: true,
        minimized: false,
        focused: true
      })),
    onWindowState: (cb) => on<DesktopWindowState>('window-state', cb),
    setTrayUnread: (count) => invoke('set_tray_unread', { count }),
    dismissNotification: (tag) => invoke('dismiss_notification', { tag }),
    getAutoLaunch: () => invoke<boolean>('get_auto_launch'),
    setAutoLaunch: (enabled) => invoke<boolean>('set_auto_launch', { enabled }),
    getStartMinimized: () => invoke<boolean>('get_start_minimized'),
    setStartMinimized: (enabled) => invoke('set_start_minimized', { enabled }),
    checkForUpdates: () => invoke('check_for_updates'),
    installUpdate: () => invoke('install_update'),
    getUpdateStatus: () => invoke<DesktopUpdateStatus>('get_update_status'),
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
    },
    onPttError: (cb) => on<string>('ptt:error', cb),
    setActivityDetectionEnabled: (enabled) =>
      invoke('set_activity_detection_enabled', { enabled }),
    setCustomDetectables: (detectables) =>
      invoke('set_custom_detectables', { detectables }),
    getDetectedActivities: () =>
      invoke<DetectedActivity[]>('get_detected_activities').catch(() => []),
    onActivityDetected: (cb) => on<DetectedActivity[]>('activity:detected', cb)
  }
}

export const desktopAPI: DesktopAPI | undefined = isDesktop ? buildDesktopAPI() : undefined

// Expose under the legacy `window.electronAPI` name so existing code paths that
// read the bridge directly off `window` (e.g. notifications) keep working.
if (desktopAPI) {
  ;(window as unknown as { electronAPI?: DesktopAPI }).electronAPI = desktopAPI
}
