import { act, renderHook } from '@testing-library/react'
import type { ActivitySnapshot, DetectedActivity, RegisteredGame } from '@chat/shared'
import { useDetectedActivity } from './useDetectedActivity'
import { useActivityStore } from '@/stores/activity.store'
import { useAuthStore } from '@/stores/auth.store'
import { desktopAPI } from '@/lib/desktop'
import { api } from '@/lib/api'

jest.mock('@/lib/desktop', () => ({
  isDesktop: true,
  desktopAPI: {
    setActivityDetectionEnabled: jest.fn().mockResolvedValue(undefined),
    setCustomDetectables: jest.fn().mockResolvedValue(undefined),
    getActivitySnapshot: jest.fn(),
    onActivitySnapshot: jest.fn(),
    onWindowState: jest.fn(() => jest.fn())
  }
}))
jest.mock('@/lib/api', () => ({
  api: {
    getActivitySettings: jest.fn(),
    getRegisteredGames: jest.fn(),
    updateRegisteredGame: jest.fn(),
    uploadActivityIcon: jest.fn(),
    upsertRegisteredGame: jest.fn(() => new Promise(() => {}))
  }
}))

const native = desktopAPI as jest.Mocked<NonNullable<typeof desktopAPI>>
const settings = {
  shareEnabled: true,
  shareGames: true,
  shareMusic: true,
  shareOnline: false,
  defaultSharing: 'friends_all' as const
}
const game: DetectedActivity = {
  source: 'steam',
  kind: 'game',
  name: 'Skyrim',
  appId: '489830',
  executable: 'skyrimse.exe',
  startedAt: 1000
}
const registeredGame: RegisteredGame = {
  id: 'skyrim',
  name: 'Skyrim',
  source: 'steam',
  steamAppId: '489830',
  executable: 'skyrimse.exe',
  iconUrl: null,
  hidden: false,
  verified: true,
  lastPlayedAt: null,
  createdAt: new Date(0).toISOString()
}
let receive: (snapshot: ActivitySnapshot) => void
let snapshot: ActivitySnapshot
let socket: any
let listeners: Map<string, () => void>
let generation: number
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  })
}
const detect = (activities: DetectedActivity[]) =>
  act(() => {
    snapshot = { activities, observedAt: Date.now(), generation: ++generation }
    receive(snapshot)
  })

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  useActivityStore.getState().reset()
  useAuthStore.setState({ user: { id: 'self' } as any })
  jest.mocked(api.getActivitySettings).mockResolvedValue(settings)
  jest.mocked(api.getRegisteredGames).mockResolvedValue([registeredGame])
  generation = 1
  snapshot = { activities: [], observedAt: Date.now(), generation }
  native.getActivitySnapshot.mockImplementation(async () => snapshot)
  native.onActivitySnapshot.mockImplementation((cb) => {
    receive = cb
    return jest.fn()
  })
  listeners = new Map()
  socket = {
    connected: true,
    emit: jest.fn((_event, _payload, ack) => ack?.({ ok: true })),
    on: jest.fn((name, cb) => listeners.set(name, cb)),
    off: jest.fn()
  }
})
afterEach(() => jest.useRealTimers())

it('publishes immediately and cannot restore an ended game when artwork finishes', async () => {
  let finish!: (value: { url: string }) => void
  jest.mocked(api.uploadActivityIcon).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([{ ...game, iconDataUrl: 'data:image/png;base64,AA==' }])
  expect(socket.emit).toHaveBeenLastCalledWith(
    'activity:update',
    expect.objectContaining({ name: 'Skyrim' }),
    expect.any(Function)
  )
  detect([])
  await act(async () => {
    finish({ url: '/art/skyrim.png' })
  })
  expect(socket.emit).toHaveBeenLastCalledWith('activity:clear', expect.any(Object), expect.any(Function))
})

it('resynchronizes an empty native observation on the same socket after reconnect', async () => {
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([game])
  act(() => {
    socket.connected = false
    listeners.get('disconnect')!()
  })
  detect([])
  act(() => {
    socket.connected = true
    listeners.get('connect')!()
  })
  await settle()
  expect(socket.emit).toHaveBeenLastCalledWith('activity:clear', expect.any(Object), expect.any(Function))
  expect(native.getActivitySnapshot.mock.calls.length).toBeGreaterThan(1)
})

it('clears a hidden game optimistically without another native event', async () => {
  jest.mocked(api.updateRegisteredGame).mockReturnValueOnce(new Promise(() => {}))
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([game])
  act(() => {
    void useActivityStore.getState().setGameHidden('skyrim', true)
  })
  expect(socket.emit).toHaveBeenLastCalledWith('activity:clear', expect.any(Object), expect.any(Function))
})

it('matches hidden Steam games by app ID even when renamed', async () => {
  jest.mocked(api.getRegisteredGames).mockResolvedValue([{ ...registeredGame, name: 'Modded Skyrim', hidden: true }])
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([game])
  expect(socket.emit).not.toHaveBeenCalledWith('activity:update', expect.anything(), expect.anything())
})

it('never renews activity from a stale cached native snapshot', async () => {
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([game])
  act(() => {
    jest.advanceTimersByTime(25_000)
  })
  expect(socket.emit).toHaveBeenLastCalledWith('activity:clear', expect.any(Object), expect.any(Function))
})

it('renews successful unchanged scans and distinguishes new game sessions', async () => {
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([game])
  act(() => {
    jest.advanceTimersByTime(15_000)
  })
  detect([game])
  act(() => {
    jest.advanceTimersByTime(5000)
  })
  const updates = socket.emit.mock.calls.filter(([event]: [string]) => event === 'activity:update')
  expect(updates).toHaveLength(2)
  detect([{ ...game, startedAt: 2000, sessionId: 'second-session' }])
  expect(socket.emit).toHaveBeenLastCalledWith(
    'activity:update',
    expect.objectContaining({ startedAt: new Date(2000).toISOString() }),
    expect.any(Function)
  )
})

it('rejects an older snapshot read that resolves after a newer empty event', async () => {
  let finish!: (snapshot: ActivitySnapshot) => void
  native.getActivitySnapshot.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([])
  await act(async () => {
    finish({ activities: [game], observedAt: Date.now(), generation: 1 })
  })
  expect(socket.emit).not.toHaveBeenCalledWith('activity:update', expect.anything(), expect.anything())
})

it('retries only the latest desired state when acknowledgments are lost', async () => {
  socket.emit.mockImplementation(() => {})
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([game])
  detect([])
  socket.emit.mockClear()
  act(() => {
    jest.advanceTimersByTime(8000)
  })
  expect(socket.emit.mock.calls.length).toBeGreaterThan(0)
  expect(socket.emit.mock.calls.every(([event]: [string]) => event === 'activity:clear')).toBe(true)
})

it('waits for hidden-game preferences before publishing native detections', async () => {
  let finish!: (games: RegisteredGame[]) => void
  jest.mocked(api.getRegisteredGames).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([game])
  expect(socket.emit).not.toHaveBeenCalledWith('activity:update', expect.anything(), expect.anything())
  await act(async () => {
    finish([{ ...registeredGame, hidden: true }])
  })
  expect(socket.emit).not.toHaveBeenCalledWith('activity:update', expect.anything(), expect.anything())
})

it('stays private when a newer preference request supersedes the startup load', async () => {
  let first!: (games: RegisteredGame[]) => void
  let second!: (games: RegisteredGame[]) => void
  jest
    .mocked(api.getRegisteredGames)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        first = resolve
      })
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        second = resolve
      })
    )
  renderHook(() => useDetectedActivity(socket))
  await settle()
  act(() => {
    void useActivityStore.getState().fetchGames()
  })
  await act(async () => {
    first([])
  })
  detect([game])
  expect(socket.emit).not.toHaveBeenCalledWith('activity:update', expect.anything(), expect.anything())
  await act(async () => {
    second([{ ...registeredGame, hidden: true }])
  })
  expect(socket.emit).not.toHaveBeenCalledWith('activity:update', expect.anything(), expect.anything())
})

it('clears immediately when sharing is disabled and discards old-account artwork', async () => {
  let finish!: (value: { url: string }) => void
  jest.mocked(api.uploadActivityIcon).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const view = renderHook(() => useDetectedActivity(socket))
  await settle()
  detect([{ ...game, iconDataUrl: 'data:image/png;base64,AA==' }])
  act(() => useActivityStore.setState({ settings: { ...settings, shareEnabled: false } }))
  expect(socket.emit).toHaveBeenLastCalledWith('activity:clear', expect.any(Object), expect.any(Function))
  view.unmount()
  socket.emit.mockClear()
  await act(async () => {
    finish({ url: '/old-account.png' })
  })
  expect(socket.emit).not.toHaveBeenCalled()
  expect(native.setActivityDetectionEnabled).toHaveBeenLastCalledWith(false)
})
