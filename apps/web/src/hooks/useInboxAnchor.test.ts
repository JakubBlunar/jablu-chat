import { act, renderHook } from '@testing-library/react'
import type { InboxGroup, InboxSession } from '@chat/shared'
import { useInboxStore } from '@/stores/inbox.store'
import { api } from '@/lib/api'
import { useInboxAnchor } from './useInboxAnchor'

jest.mock('@/lib/api', () => ({ api: { saveInboxAnchor: jest.fn() } }))
const group: InboxGroup = {
  key: 'thread:p1',
  name: 'general',
  serverName: 'Test',
  target: { mode: 'channel', contextId: 'c1', serverId: 's1', threadParentId: 'p1', messageId: 'first' },
  unreadCount: 2,
  mentionCount: 0,
  replyCount: 1,
  latestAt: '2026-01-01T12:00:00.000Z',
  savedAt: null,
  highlights: []
}
const session: InboxSession = {
  id: 'session',
  revision: 0,
  view: 'unread',
  snapshotAt: group.latestAt,
  groups: [group],
  index: 0,
  completed: 0,
  deferred: 0,
  anchor: group.target
}
function surface() {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => new DOMRect(0, 100, 300, 400)
  for (const [id, top] of [
    ['above', 0],
    ['visible', 110],
    ['below', 600]
  ] as const) {
    const message = document.createElement('div')
    message.id = `msg-${id}`
    message.getBoundingClientRect = () => new DOMRect(0, top, 300, 50)
    container.append(message)
  }
  document.body.append(container)
  return { current: container }
}
beforeEach(() => {
  jest.useFakeTimers()
  jest.resetAllMocks()
  useInboxStore.getState().reset()
  useInboxStore.setState({ session })
  useInboxStore.getState().resume()
  useInboxStore.getState().confirmNavigation('channel', 'c1', 'first', 'p1')
  jest.mocked(api.saveInboxAnchor).mockImplementation(async (_id, revision, target) => ({
    session: { ...session, revision: revision + 1, anchor: target }
  }))
})
afterEach(() => {
  jest.useRealTimers()
  document.body.replaceChildren()
})

it('stages the first visible reply immediately and persists its thread context after a debounce', async () => {
  const scroll = surface()
  renderHook(() => useInboxAnchor('channel', 'c1', 'p1', scroll, true))
  expect(useInboxStore.getState().reader?.target).toEqual({ ...group.target, messageId: 'visible' })
  expect(api.saveInboxAnchor).not.toHaveBeenCalled()
  await act(async () => {
    jest.advanceTimersByTime(800)
  })
  expect(api.saveInboxAnchor).toHaveBeenCalledWith('session', 0, { ...group.target, messageId: 'visible' })
})

it.each([
  ['channel', 'c1', null, true],
  ['channel', 'c1', 'other-thread', true],
  ['dm', 'c1', 'p1', true],
  ['channel', 'other-channel', 'p1', true],
  ['channel', 'c1', 'p1', false]
] as const)('does not capture another or unready surface (%s %s %s %s)', async (mode, context, thread, ready) => {
  const scroll = surface()
  renderHook(() => useInboxAnchor(mode, context, thread, scroll, ready))
  await act(async () => {
    jest.advanceTimersByTime(800)
  })
  expect(api.saveInboxAnchor).not.toHaveBeenCalled()
  expect(useInboxStore.getState().reader?.target).toEqual(group.target)
})

it('flushes the staged position when the surface leaves before the debounce', async () => {
  const scroll = surface()
  const { unmount } = renderHook(() => useInboxAnchor('channel', 'c1', 'p1', scroll, true))
  await act(async () => {
    unmount()
  })
  expect(api.saveInboxAnchor).toHaveBeenCalledWith('session', 0, { ...group.target, messageId: 'visible' })
})

it('does not capture messages underneath the open Inbox', async () => {
  useInboxStore.getState().show()
  const scroll = surface()
  renderHook(() => useInboxAnchor('channel', 'c1', 'p1', scroll, true))
  await act(async () => {
    jest.advanceTimersByTime(800)
  })
  expect(api.saveInboxAnchor).not.toHaveBeenCalled()
})

it('does not overwrite resume with the old viewport before the requested jump has loaded', async () => {
  useInboxStore.getState().resume()
  const scroll = surface()
  const { rerender } = renderHook(() => useInboxAnchor('channel', 'c1', 'p1', scroll, true))
  await act(async () => {
    jest.advanceTimersByTime(800)
  })
  expect(api.saveInboxAnchor).not.toHaveBeenCalled()
  expect(useInboxStore.getState().reader?.target).toEqual(group.target)
  act(() => useInboxStore.getState().confirmNavigation('channel', 'c1', 'first', 'p1'))
  rerender()
  await act(async () => {
    jest.advanceTimersByTime(800)
  })
  expect(api.saveInboxAnchor).toHaveBeenCalledWith('session', 0, { ...group.target, messageId: 'visible' })
})
