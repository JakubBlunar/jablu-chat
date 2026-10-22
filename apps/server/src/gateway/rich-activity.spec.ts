import { RichActivityTracker, type ActivityPolicy } from './rich-activity'

const game = {
  kind: 'game' as const,
  name: 'Skyrim',
  appId: '489830',
  executable: 'skyrimse.exe',
  startedAt: '2026-10-22T10:00:00Z'
}
let policy: ActivityPolicy
let read: jest.Mock
let emit: jest.Mock
let tracker: RichActivityTracker
beforeEach(() => {
  jest.useFakeTimers()
  policy = {
    shareEnabled: true,
    shareGames: true,
    shareMusic: true,
    hiddenGames: [],
    recipientIds: new Set(['friend', 'member'])
  }
  read = jest.fn(async () => ({ ...policy, recipientIds: new Set(policy.recipientIds) }))
  emit = jest.fn()
  tracker = new RichActivityTracker(read, emit)
})
afterEach(() => jest.useRealTimers())
const update = (sequence = 1, socket = 'desktop') => tracker.update('player', socket, { ...game, sequence }, () => true)

it('does not restore a game when a clear overtakes a pending policy lookup', async () => {
  let finish!: (value: ActivityPolicy) => void
  read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const pending = update()
  await Promise.resolve()
  const clearing = tracker.clear('player', 'desktop', 2)
  finish(policy)
  await Promise.all([pending, clearing])
  expect(tracker.snapshot('friend').activities).toEqual({})
  expect(emit).not.toHaveBeenCalledWith(
    'friend',
    expect.objectContaining({ activity: expect.objectContaining({ name: 'Skyrim' }) })
  )
})

it('clears an existing game without waiting for an outstanding database read', async () => {
  await update()
  let finish!: (value: ActivityPolicy) => void
  read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const pending = tracker.update('player', 'desktop', { ...game, details: 'changed', sequence: 2 }, () => true)
  await Promise.resolve()
  await tracker.clear('player', 'desktop', 3)
  expect(tracker.snapshot('friend').activities).toEqual({})
  finish(policy)
  await pending
  expect(tracker.snapshot('friend').activities).toEqual({})
})

it('bounds a stalled privacy lookup so future observations can recover', async () => {
  read.mockReturnValueOnce(new Promise(() => {}))
  const pending = update().catch((err) => err)
  await jest.advanceTimersByTimeAsync(5000)
  expect((await pending).message).toContain('timed out')
  await update(2)
  expect(tracker.snapshot('friend').activities.player.name).toBe('Skyrim')
})

it('expires without fresh detector reports even while other sessions stay online', async () => {
  await update()
  jest.advanceTimersByTime(RichActivityTracker.LEASE_MS + 1)
  await tracker.expire()
  expect(tracker.snapshot('friend').activities).toEqual({})
  expect(emit).toHaveBeenLastCalledWith('player', expect.objectContaining({ activity: null }))
})

it('renews unchanged reports without redundant fanout or policy queries', async () => {
  await update()
  emit.mockClear()
  jest.advanceTimersByTime(20_000)
  await update(2)
  expect(read).toHaveBeenCalledTimes(1)
  expect(emit).not.toHaveBeenCalled()
  jest.advanceTimersByTime(71_000)
  await tracker.expire()
  expect(tracker.snapshot('friend').activities).not.toEqual({})
})

it('ignores old retries and idle clears from another desktop', async () => {
  await update(2)
  await tracker.clear('player', 'idle-desktop', 1)
  await tracker.clear('player', 'desktop', 1)
  expect(tracker.snapshot('friend').activities.player.name).toBe('Skyrim')
})

it('preserves the active owner when another desktop disconnects during takeover', async () => {
  await update()
  let finish!: (value: ActivityPolicy) => void
  read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const takingOver = update(1, 'second-desktop')
  await Promise.resolve()
  const leaving = tracker.disconnect('second-desktop')
  finish(policy)
  await Promise.all([takingOver, leaving])
  expect(tracker.snapshot('friend').activities.player.name).toBe('Skyrim')
  await tracker.clear('player', 'desktop', 2)
  expect(tracker.snapshot('friend').activities).toEqual({})
})

it('clears the old owner while a valid takeover is pending', async () => {
  await update()
  let finish!: (value: ActivityPolicy) => void
  read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const takingOver = update(1, 'second-desktop')
  await Promise.resolve()
  await tracker.disconnect('desktop')
  expect(tracker.snapshot('friend').activities).toEqual({})
  finish(policy)
  await takingOver
  expect(tracker.snapshot('friend').activities.player.name).toBe('Skyrim')
})

it('does not alternate owners when multiple desktops renew the same sessions', async () => {
  await update(1, 'desktop')
  await update(1, 'second-desktop')
  await update(2, 'desktop')
  await tracker.clear('player', 'desktop', 3)
  expect(tracker.snapshot('friend').activities.player.name).toBe('Skyrim')
  await tracker.clear('player', 'second-desktop', 2)
  expect(tracker.snapshot('friend').activities).toEqual({})
})

it('does not let a lower-priority desktop cancel privacy revocation', async () => {
  await update(1, 'second-desktop')
  policy.shareEnabled = false
  const refreshing = tracker.refresh('player')
  const observing = update(1, 'desktop')
  await Promise.all([refreshing, observing])
  expect(tracker.snapshot('friend').activities).toEqual({})
  expect(emit).toHaveBeenCalledWith('friend', expect.objectContaining({ activity: null }))
})

it('clears the owner on disconnect, including users without any server', async () => {
  policy.recipientIds = new Set(['friend'])
  await update()
  await tracker.disconnect('desktop')
  expect(tracker.snapshot('friend').activities).toEqual({})
})

it('does not commit work from a disconnected socket', async () => {
  let connected = true
  let finish!: (value: ActivityPolicy) => void
  read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const pending = tracker.update('player', 'desktop', game, () => connected)
  await Promise.resolve()
  connected = false
  const clearing = tracker.disconnect('desktop')
  finish(policy)
  await Promise.all([pending, clearing])
  expect(tracker.snapshot('friend').activities).toEqual({})
})

it('enforces hidden games by Steam identity after a rename', async () => {
  policy.hiddenGames = [{ name: 'My modded game', steamAppId: '489830', executable: null }]
  await update()
  expect(tracker.snapshot('friend').activities).toEqual({})
})

it('revokes sharing from old recipients and preserves friends allowed through another scope', async () => {
  await update()
  emit.mockClear()
  policy.recipientIds = new Set(['friend', 'new-member'])
  await tracker.refresh('player')
  expect(emit).toHaveBeenCalledWith('member', expect.objectContaining({ activity: null }))
  expect(emit).not.toHaveBeenCalledWith('friend', expect.objectContaining({ activity: null }))
  expect(tracker.snapshot('member').activities).toEqual({})
  expect(tracker.snapshot('friend').activities.player.name).toBe('Skyrim')
  expect(tracker.snapshot('new-member').activities.player.name).toBe('Skyrim')
})

it('hides pending privacy refreshes from new snapshots and invalidates cached permissions', async () => {
  await update()
  policy.shareEnabled = false
  const refreshing = tracker.refresh('player')
  expect(tracker.snapshot('friend').activities).toEqual({})
  await refreshing
  await update(2)
  expect(tracker.snapshot('friend').activities).toEqual({})
})

it('clears previous recipients if privacy reconciliation fails', async () => {
  await update()
  read.mockRejectedValueOnce(new Error('Privacy lookup unavailable'))
  await expect(tracker.refresh('player')).rejects.toThrow('Privacy lookup unavailable')
  expect(tracker.snapshot('friend').activities).toEqual({})
  expect(emit).toHaveBeenCalledWith('friend', expect.objectContaining({ activity: null }))
})

it('always includes the reporting user without exposing internal process data', async () => {
  policy.recipientIds.clear()
  await update()
  const snapshot = tracker.snapshot('player')
  expect(snapshot.activities.player.name).toBe('Skyrim')
  expect(snapshot.activities.player).not.toHaveProperty('executable')
  expect(snapshot.activities.player).not.toHaveProperty('sequence')
  expect(tracker.snapshot('stranger').activities).toEqual({})
})
