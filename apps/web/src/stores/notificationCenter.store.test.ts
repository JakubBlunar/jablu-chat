import { useNotificationCenterStore } from './notificationCenter.store'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({ api: {
  getInAppNotificationUnreadCount: jest.fn(), getInAppNotifications: jest.fn(),
  markInAppNotificationRead: jest.fn(), markAllInAppNotificationsRead: jest.fn(), markReactionsSeen: jest.fn()
} }))
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
beforeEach(() => { useNotificationCenterStore.getState().reset(); jest.clearAllMocks() })

it('acknowledges only visible reaction versions and preserves the numeric badge', async () => {
  const older = { id: 'one', updatedAt: '2026-11-20T10:00:00.000Z', messageId: 'old', emoji: '👍', isCustom: false }
  const current = { ...older, id: 'two', messageId: 'current' }
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 3, reactions: [older, current] })
  const store = useNotificationCenterStore.getState
  await store().fetchUnread()
  const visible = store().reactionsByMessage.get('current')!
  const pending = deferred<{ ids: string[]; readAt: string }>()
  jest.mocked(api.markReactionsSeen).mockReturnValue(pending.promise)
  const ack = store().markReactionsSeen(visible)
  await store().markReactionsSeen(visible)
  expect(api.markReactionsSeen).toHaveBeenCalledTimes(1)
  expect(api.markReactionsSeen).toHaveBeenCalledWith([{ id: current.id, updatedAt: current.updatedAt }])

  const newer = { ...current, updatedAt: '2026-11-20T10:01:00.000Z' }
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 3, reactions: [older, newer] })
  await store().fetchUnread()
  pending.resolve({ ids: [current.id], readAt: '2026-11-20T10:00:04.000Z' })
  await ack
  expect(store().unreadCount).toBe(3)
  expect(store().reactionsByMessage.get('old')).toEqual([older])
  expect(store().reactionsByMessage.get('current')).toEqual([newer])
})

it('refreshes per-server notice counts on bumps, read and read-all across reloads', async () => {
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 2, serverCounts: { server: 2 } })
  await useNotificationCenterStore.getState().fetchUnread()
  expect(useNotificationCenterStore.getState().serverCounts).toEqual({ server: 2 })
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 1, serverCounts: { server: 1 } })
  await useNotificationCenterStore.getState().markRead('notice')
  expect(useNotificationCenterStore.getState().serverCounts).toEqual({ server: 1 })
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 0, serverCounts: {} })
  await useNotificationCenterStore.getState().markAllRead()
  expect(useNotificationCenterStore.getState().serverCounts).toEqual({})
})

it('turns 100 notification bumps into one active and one trailing badge request', async () => {
  const first = deferred<{ count: number }>()
  jest.mocked(api.getInAppNotificationUnreadCount).mockReturnValueOnce(first.promise).mockResolvedValue({ count: 100 })
  for (let i = 0; i < 100; i++) useNotificationCenterStore.getState().applySocketBump()
  expect(api.getInAppNotificationUnreadCount).toHaveBeenCalledTimes(1)
  first.resolve({ count: 1 })
  await useNotificationCenterStore.getState().fetchUnread()
  expect(api.getInAppNotificationUnreadCount).toHaveBeenCalledTimes(2)
  expect(useNotificationCenterStore.getState().unreadCount).toBe(100)
})

it('does not lose a notification arriving while an open list loads', async () => {
  const first = deferred<{ items: never[] }>()
  jest.mocked(api.getInAppNotifications).mockReturnValueOnce(first.promise).mockResolvedValue({ items: [] })
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 2 })
  useNotificationCenterStore.getState().setPanelOpen(true)
  const request = useNotificationCenterStore.getState().fetchList()
  useNotificationCenterStore.getState().applySocketBump()
  first.resolve({ items: [] })
  await request
  expect(api.getInAppNotifications).toHaveBeenCalledTimes(2)
})

it('ignores a previous account response without clearing the new active request', async () => {
  const old = deferred<{ count: number }>()
  const next = deferred<{ count: number }>()
  jest.mocked(api.getInAppNotificationUnreadCount).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  const previous = useNotificationCenterStore.getState().fetchUnread()
  useNotificationCenterStore.getState().reset()
  const current = useNotificationCenterStore.getState().fetchUnread()
  old.resolve({ count: 99 })
  await previous
  expect(useNotificationCenterStore.getState().unreadCount).toBe(0)
  expect(useNotificationCenterStore.getState().loading).toBe(true)
  next.resolve({ count: 3 })
  await current
  expect(useNotificationCenterStore.getState().unreadCount).toBe(3)
})
