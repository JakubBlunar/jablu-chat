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

it('leaves the app badge clear when only Inbox activity is unread', () => {
  useNotificationCenterStore.setState({ unreadCount: 3 })
  const hook = renderHook(() => useAppBadge())
  expect(desktopAPI?.setTrayUnread).toHaveBeenLastCalledWith(0)
  hook.unmount()
})

it('updates on new DMs and clears when they are read on another device', () => {
  const hook = renderHook(() => useAppBadge())
  act(() => useReadStateStore.setState({ dms: new Map([['dm', {
    unreadCount: 12, mentionCount: 12, lastReadAt: '2026-11-20T10:00:00Z', firstUnreadMessageId: 'm1'
  }]]) }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenLastCalledWith(12)
  act(() => useReadStateStore.setState({ dms: new Map() }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenLastCalledWith(0)
  hook.unmount()
})

it('shows the same directed attention count on the Windows and PWA app icons', () => {
  const originalSet = Object.getOwnPropertyDescriptor(navigator, 'setAppBadge')
  const originalClear = Object.getOwnPropertyDescriptor(navigator, 'clearAppBadge')
  const setAppBadge = jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: setAppBadge })
  Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: jest.fn().mockResolvedValue(undefined) })
  const unread = { lastReadAt: '2026-11-20T10:00:00Z', firstUnreadMessageId: 'm1', unreadCount: 8, mentionCount: 0 }
  useReadStateStore.setState({
    channels: new Map([['quiet-channel', unread], ['mentioned-channel', { ...unread, mentionCount: 1 }]]),
    dms: new Map([['conversation', { ...unread, unreadCount: 1 }]])
  })
  useNotificationCenterStore.setState({ unreadCount: 6 })

  const hook = renderHook(() => useAppBadge())
  try {
    expect([
      jest.mocked(desktopAPI!.setTrayUnread).mock.lastCall?.[0],
      setAppBadge.mock.lastCall?.[0]
    ]).toEqual([2, 2])
  } finally {
    hook.unmount()
    if (originalSet) Object.defineProperty(navigator, 'setAppBadge', originalSet)
    else Reflect.deleteProperty(navigator, 'setAppBadge')
    if (originalClear) Object.defineProperty(navigator, 'clearAppBadge', originalClear)
    else Reflect.deleteProperty(navigator, 'clearAppBadge')
  }
})

it('ignores list/loading changes and unsubscribes when the app layout unmounts', () => {
  const hook = renderHook(() => useAppBadge())
  act(() => useNotificationCenterStore.setState({ listLoading: true }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenCalledTimes(1)
  hook.unmount()
  expect(desktopAPI?.setTrayUnread).toHaveBeenLastCalledWith(0)
  act(() => useNotificationCenterStore.setState({ unreadCount: 5 }))
  expect(desktopAPI?.setTrayUnread).toHaveBeenCalledTimes(2)
})
