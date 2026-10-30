import { renderHook, act, waitFor } from '@testing-library/react'
import { useRouteSync } from './useRouteSync'
import type { ConversationRequest } from '@/lib/conversationTarget'

let mockLocation: { pathname: string; search: string; key: string; state?: unknown }
const mockNavigate = jest.fn()
const mockEnter = jest.fn()
const mockCancel = jest.fn()
jest.mock('react-router-dom', () => ({ useLocation: () => mockLocation, useNavigate: () => mockNavigate }))
jest.mock('@/stores/navigation.store', () => ({
  useNavigationStore: { getState: () => ({ enterRoute: mockEnter, cancelNavigation: mockCancel, activeNavId: 7 }) }
}))
function route(pathname = '/channels/s1/ch1', search = '', state?: unknown) {
  mockLocation = { pathname, search, key: Math.random().toString(), state }
  window.history.replaceState({ key: mockLocation.key }, '', pathname + search)
}
beforeEach(() => {
  jest.clearAllMocks()
  route()
  mockEnter.mockImplementation(async (request: ConversationRequest) => ({ status: 'opened', target: request.target }))
})
it('hands each committed URL to one coordinator and preserves message/thread intent', async () => {
  route('/channels/s1/ch1', '?m=reply&thread=parent&keep=yes', { conversationRequestId: 9 })
  const { rerender } = renderHook(() => useRouteSync())
  await waitFor(() =>
    expect(mockNavigate).toHaveBeenCalledWith('/channels/s1/ch1?keep=yes', {
      replace: true,
      state: { conversationConsumedId: 7 }
    })
  )
  expect(mockEnter).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { kind: 'channel', serverId: 's1', channelId: 'ch1' },
      position: { kind: 'message', messageId: 'reply', threadParentId: 'parent' }
    }),
    expect.objectContaining({ requestId: 9, key: mockLocation.key })
  )
  rerender()
  expect(mockEnter).toHaveBeenCalledTimes(1)
})
it('does not consume a failed or superseded link', async () => {
  let finish!: (outcome: unknown) => void
  mockEnter.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  route('/channels/s1/ch1', '?m=old')
  renderHook(() => useRouteSync())
  window.history.replaceState({ key: 'new' }, '', '/channels/@me')
  await act(async () => finish({ status: 'opened' }))
  expect(mockNavigate).not.toHaveBeenCalled()
})
it('forwards a consumed entry without rebuilding its focus query', () => {
  route('/channels/@me/d1', '', { conversationConsumedId: 7 })
  renderHook(() => useRouteSync())
  expect(mockEnter).toHaveBeenCalledWith(
    expect.objectContaining({ target: { kind: 'dm', conversationId: 'd1' } }),
    expect.objectContaining({ consumedId: 7 })
  )
  expect(mockNavigate).not.toHaveBeenCalled()
})
it('cancels pending work when leaving conversations or unmounting', () => {
  const { rerender, unmount } = renderHook(() => useRouteSync())
  route('/settings')
  rerender()
  expect(mockCancel).toHaveBeenCalledTimes(1)
  unmount()
  expect(mockCancel).toHaveBeenCalledTimes(2)
})
it('ignores an obsolete render whose history entry already changed', () => {
  window.history.replaceState({ key: 'other' }, '', '/channels/@me')
  renderHook(() => useRouteSync())
  expect(mockEnter).not.toHaveBeenCalled()
})
