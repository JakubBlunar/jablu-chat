import { useNotificationCenterStore } from './notificationCenter.store'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({ api: {
  getInAppNotificationUnreadCount: jest.fn(), getInAppNotifications: jest.fn()
} }))
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
beforeEach(() => { useNotificationCenterStore.getState().reset(); jest.clearAllMocks() })

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
