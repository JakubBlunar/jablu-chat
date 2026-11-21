import { act, renderHook } from '@testing-library/react'
import type { Socket } from 'socket.io-client'
import { getAppVisibilityState, subscribeAppVisibility } from '@/lib/appVisibility'
import { clearNotifications } from '@/lib/notifications'
import { usePresenceReporter } from './usePresenceReporter'

jest.mock('@/lib/appVisibility', () => ({
  getAppVisibilityState: jest.fn(),
  subscribeAppVisibility: jest.fn(() => jest.fn())
}))
jest.mock('@/lib/notifications', () => ({ clearNotifications: jest.fn() }))

it('preserves outstanding alerts when the app regains focus', () => {
  const socket = { connected: true, on: jest.fn(), off: jest.fn(), emit: jest.fn() }
  const background = { visibility: 'hidden', focused: false } as const
  const foreground = { visibility: 'visible', focused: true } as const
  jest.mocked(getAppVisibilityState).mockReturnValue(background)
  renderHook(() => usePresenceReporter(socket as unknown as Socket))
  const [reportVisibility] = jest.mocked(subscribeAppVisibility).mock.lastCall!

  jest.mocked(getAppVisibilityState).mockReturnValue(foreground)
  act(() => reportVisibility(foreground))

  expect(socket.emit).toHaveBeenCalledWith('presence:state', foreground)
  expect(clearNotifications).not.toHaveBeenCalled()
})
