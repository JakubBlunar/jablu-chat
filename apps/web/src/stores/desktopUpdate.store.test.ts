import { act } from '@testing-library/react'
import type { DesktopUpdateStatus } from '@/lib/desktop'

const listeners: Record<string, Array<(payload: unknown) => void>> = {}

function subscribe(event: string, cb: (payload: unknown) => void) {
  listeners[event] = listeners[event] ?? []
  listeners[event].push(cb)
  return () => {
    listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb)
  }
}

function emit(event: string, payload?: unknown) {
  for (const fn of listeners[event] ?? []) fn(payload)
}

const mockStatus: DesktopUpdateStatus = {
  lastCheckedAt: null,
  lastError: null,
  feedConfigured: true,
  pendingVersion: null,
  availableVersion: null
}

const mockElectronAPI = {
  checkForUpdates: jest.fn().mockResolvedValue(undefined),
  installUpdate: jest.fn().mockResolvedValue(undefined),
  getUpdateStatus: jest.fn().mockResolvedValue({ ...mockStatus }),
  onUpdateAvailable: (cb: (info: { version: string }) => void) => subscribe('available', cb as (p: unknown) => void),
  onUpdateNotAvailable: (cb: () => void) => subscribe('not-available', cb as (p: unknown) => void),
  onUpdateDownloadProgress: (
    cb: (progress: { percent: number; transferred: number; total: number }) => void
  ) => subscribe('progress', cb as (p: unknown) => void),
  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
    subscribe('downloaded', cb as (p: unknown) => void),
  onUpdateError: (cb: (err: { message: string }) => void) => subscribe('error', cb as (p: unknown) => void),
  onUpdateIncompatible: (
    cb: (info: {
      reason: 'client-too-old' | 'client-too-new' | null
      minClient: string
      maxClient: string | null
    }) => void
  ) => subscribe('incompatible', cb as (p: unknown) => void)
}

jest.mock('@/lib/electron', () => ({
  get electronAPI() {
    return mockElectronAPI
  },
  isElectron: true
}))

import {
  resetDesktopUpdateSyncForTests,
  startDesktopUpdateSync,
  useDesktopUpdateStore
} from './desktopUpdate.store'

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('desktopUpdate.store', () => {
  beforeEach(() => {
    for (const key of Object.keys(listeners)) delete listeners[key]
    mockElectronAPI.getUpdateStatus.mockResolvedValue({ ...mockStatus })
    mockElectronAPI.checkForUpdates.mockResolvedValue(undefined)
    mockElectronAPI.installUpdate.mockResolvedValue(undefined)
    resetDesktopUpdateSyncForTests()
  })

  it('hydrates a pending update that was downloaded before the UI mounted', async () => {
    mockElectronAPI.getUpdateStatus.mockResolvedValue({
      ...mockStatus,
      lastCheckedAt: 1_700_000_000_000,
      pendingVersion: '1.2.3'
    })

    startDesktopUpdateSync()
    await flush()

    expect(useDesktopUpdateStore.getState().state).toEqual({ status: 'ready', version: '1.2.3' })
    expect(useDesktopUpdateStore.getState().lastCheckedAt).toBe(1_700_000_000_000)
  })

  it('hydrates an in-progress download so the title bar appears immediately', async () => {
    mockElectronAPI.getUpdateStatus.mockResolvedValue({
      ...mockStatus,
      availableVersion: '1.4.1'
    })

    startDesktopUpdateSync()
    await flush()

    expect(useDesktopUpdateStore.getState().state).toEqual({
      status: 'downloading',
      version: '1.4.1',
      percent: 0
    })
  })

  it('does not clobber a live ready state with a stale idle snapshot', async () => {
    let resolveStatus: (value: DesktopUpdateStatus) => void = () => {}
    mockElectronAPI.getUpdateStatus.mockReturnValue(
      new Promise<DesktopUpdateStatus>((resolve) => {
        resolveStatus = resolve
      })
    )

    startDesktopUpdateSync()
    act(() => emit('downloaded', { version: '2.0.0' }))
    expect(useDesktopUpdateStore.getState().state).toEqual({ status: 'ready', version: '2.0.0' })

    await act(async () => {
      resolveStatus({ ...mockStatus })
      await Promise.resolve()
    })

    expect(useDesktopUpdateStore.getState().state).toEqual({ status: 'ready', version: '2.0.0' })
  })

  it('tracks download progress and marks the update ready', async () => {
    startDesktopUpdateSync()
    await flush()

    act(() => emit('available', { version: '1.4.0' }))
    expect(useDesktopUpdateStore.getState().state).toEqual({ status: 'available', version: '1.4.0' })

    act(() => emit('progress', { percent: 40, transferred: 40, total: 100 }))
    expect(useDesktopUpdateStore.getState().state).toEqual({
      status: 'downloading',
      version: '1.4.0',
      percent: 40
    })

    act(() => emit('downloaded', { version: '1.4.0' }))
    expect(useDesktopUpdateStore.getState().state).toEqual({ status: 'ready', version: '1.4.0' })
  })

  it('installs the downloaded update', async () => {
    startDesktopUpdateSync()
    await flush()
    act(() => emit('downloaded', { version: '1.5.0' }))

    await act(async () => {
      await useDesktopUpdateStore.getState().install()
    })

    expect(mockElectronAPI.installUpdate).toHaveBeenCalled()
  })

  it('surfaces install failures', async () => {
    mockElectronAPI.installUpdate.mockRejectedValue(new Error('no pending update'))
    startDesktopUpdateSync()
    await flush()

    await act(async () => {
      await useDesktopUpdateStore.getState().install()
    })

    expect(useDesktopUpdateStore.getState().state).toEqual({
      status: 'error',
      message: 'no pending update'
    })
    expect(useDesktopUpdateStore.getState().installing).toBe(false)
  })
})
