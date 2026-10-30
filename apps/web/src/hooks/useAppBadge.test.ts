import { act, renderHook } from '@testing-library/react'
import { useAppBadge } from './useAppBadge'
import { desktopAPI } from '@/lib/desktop'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { useReadStateStore } from '@/stores/readState.store'

jest.mock('@/lib/desktop', () => ({
  isDesktop: true,
  desktopAPI: { setTrayUnread: jest.fn().mockResolvedValue(undefined) }
}))

beforeEach(() => {
  jest.clearAllMocks()
  useNotificationCenterStore.getState().reset()
  useReadStateStore.setState({ channels: new Map(), dms: new Map(), channelToServer: new Map() })
})

it('shows unread inbox notifications even with no mentions or DMs', () => {
  useNotificationCenterStore.setState({ unreadCount: 3 })
  const hook = renderHook(() => useAppBadge())
  expect(desktopAPI?.setTrayUnread).toHaveBeenLastCalledWith(3)
  hook.unmount()
})

it('updates on new notifications and clears when they are read on another device', () => {
  const hook = renderHook(() => useAppBadge())
  act(() => useNotificationCenterStore.setState({ unreadCount: 12 }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenLastCalledWith(12)
  act(() => useNotificationCenterStore.setState({ unreadCount: 0 }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenLastCalledWith(0)
  hook.unmount()
})

it('ignores list/loading changes and unsubscribes when the app layout unmounts', () => {
  const hook = renderHook(() => useAppBadge())
  act(() => useNotificationCenterStore.setState({ listLoading: true }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenCalledTimes(1)
  hook.unmount()
  act(() => useNotificationCenterStore.setState({ unreadCount: 5 }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenCalledTimes(1)
})
