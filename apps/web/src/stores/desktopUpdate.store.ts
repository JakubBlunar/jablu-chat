import { create } from 'zustand'
import { electronAPI } from '@/lib/electron'
import type { DesktopUpdateStatus } from '@/lib/desktop'

export type DesktopUpdateIncompatible = {
  reason: 'client-too-old' | 'client-too-new' | null
  minClient: string
  maxClient: string | null
}

export type DesktopUpdateUiState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }
  | ({ status: 'incompatible' } & DesktopUpdateIncompatible)

type DesktopUpdateStore = {
  state: DesktopUpdateUiState
  lastCheckedAt: number | null
  checking: boolean
  installing: boolean
  hydrate: (snapshot: DesktopUpdateStatus) => void
  check: () => Promise<void>
  install: () => Promise<void>
}

function snapshotToState(snapshot: DesktopUpdateStatus): DesktopUpdateUiState {
  if (snapshot.pendingVersion) return { status: 'ready', version: snapshot.pendingVersion }
  if (snapshot.availableVersion) {
    return { status: 'downloading', version: snapshot.availableVersion, percent: 0 }
  }
  if (snapshot.lastError) return { status: 'error', message: snapshot.lastError }
  return { status: 'idle' }
}

function progressRank(state: DesktopUpdateUiState): number {
  if (state.status === 'ready') return 3
  if (state.status === 'downloading' || state.status === 'available') return 2
  if (state.status === 'error' || state.status === 'incompatible') return 1
  return 0
}

export const useDesktopUpdateStore = create<DesktopUpdateStore>((set, get) => ({
  state: { status: 'idle' },
  lastCheckedAt: null,
  checking: false,
  installing: false,

  hydrate: (snapshot) => {
    const next = snapshotToState(snapshot)
    const current = get().state
    set({
      lastCheckedAt: snapshot.lastCheckedAt ?? get().lastCheckedAt,
      // Don't clobber a live download if the snapshot was taken before it finished.
      state: progressRank(next) >= progressRank(current) ? next : current
    })
  },

  check: async () => {
    if (!electronAPI) return
    set({ checking: true })
    const current = get().state
    if (current.status === 'error') set({ state: { status: 'idle' } })
    try {
      await electronAPI.checkForUpdates()
    } catch {
      set({ checking: false })
    } finally {
      set({ checking: false })
    }
  },

  install: async () => {
    if (!electronAPI) return
    set({ installing: true })
    try {
      await electronAPI.installUpdate()
    } catch (e: unknown) {
      set({
        installing: false,
        state: {
          status: 'error',
          message: e instanceof Error ? e.message : 'Failed to install update'
        }
      })
    }
  }
}))

let syncStarted = false
let unsubSync: (() => void) | null = null

/** Subscribe to native updater events and hydrate any already-downloaded update. */
export function startDesktopUpdateSync(): () => void {
  if (!electronAPI || syncStarted) return () => {}
  syncStarted = true

  const unsubs = [
    electronAPI.onUpdateAvailable((info) => {
      useDesktopUpdateStore.setState({
        checking: false,
        lastCheckedAt: Date.now(),
        state: { status: 'available', version: info.version }
      })
    }),
    electronAPI.onUpdateNotAvailable(() => {
      const current = useDesktopUpdateStore.getState().state
      useDesktopUpdateStore.setState({
        checking: false,
        lastCheckedAt: Date.now(),
        state: current.status === 'ready' ? current : { status: 'idle' }
      })
    }),
    electronAPI.onUpdateDownloadProgress((progress) => {
      const current = useDesktopUpdateStore.getState().state
      const version =
        current.status === 'available' || current.status === 'downloading' || current.status === 'ready'
          ? current.version
          : ''
      useDesktopUpdateStore.setState({
        state: { status: 'downloading', version, percent: progress.percent }
      })
    }),
    electronAPI.onUpdateDownloaded((info) => {
      useDesktopUpdateStore.setState({
        checking: false,
        state: { status: 'ready', version: info.version }
      })
    }),
    electronAPI.onUpdateError((err) => {
      useDesktopUpdateStore.setState({
        checking: false,
        installing: false,
        state: { status: 'error', message: err.message }
      })
    }),
    electronAPI.onUpdateIncompatible((info) => {
      useDesktopUpdateStore.setState({
        checking: false,
        state: {
          status: 'incompatible',
          reason: info.reason,
          minClient: info.minClient,
          maxClient: info.maxClient
        }
      })
    })
  ]

  void electronAPI
    .getUpdateStatus()
    .then((snapshot) => {
      useDesktopUpdateStore.getState().hydrate({
        lastCheckedAt: snapshot.lastCheckedAt ?? null,
        lastError: snapshot.lastError ?? null,
        feedConfigured: snapshot.feedConfigured,
        pendingVersion: snapshot.pendingVersion ?? null,
        availableVersion: snapshot.availableVersion ?? null
      })
    })
    .catch(() => {})

  unsubSync = () => {
    unsubs.forEach((fn) => fn())
    syncStarted = false
    unsubSync = null
  }

  return unsubSync
}

/** Test helper: drop listeners and reset store state. */
export function resetDesktopUpdateSyncForTests() {
  unsubSync?.()
  useDesktopUpdateStore.setState({
    state: { status: 'idle' },
    lastCheckedAt: null,
    checking: false,
    installing: false
  })
}
