import { act, renderHook, waitFor } from '@testing-library/react'
import { useChannelSocketSync } from './useChannelSocketSync'
import { createChannelHandlers } from './socket/channelHandlers'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { makeMessage } from '@/test/factories'
import { clearCache, peekContext, channelKey, putContext } from '@/lib/cache/messageCache'
import { useMessageStore } from '@/stores/message.store'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { useAuthStore } from '@/stores/auth.store'

jest.mock('@/lib/socket', () => ({ getSocket: jest.fn() }))
jest.mock('@/lib/api', () => ({ api: { get: jest.fn() } }))
jest.mock('@/lib/notifications', () => ({ showNotification: jest.fn() }))
jest.mock('@/lib/appVisibility', () => ({ isAppFocused: () => true }))

it('catches background arrivals, edits, and deletions even if an old prefetch completes after the watch ack', async () => {
  clearCache()
  const emit = jest.fn()
  jest.mocked(getSocket).mockReturnValue({ emit, on: jest.fn(), off: jest.fn() } as never)
  useAuthStore.setState({ user: { id: 'me' } } as never)
  useServerStore.setState({ viewMode: 'server' })
  useChannelStore.setState({ currentChannelId: 'channel' })
  const deleted = makeMessage({ id: 'deleted', channelId: 'channel', createdAt: '2026-01-01T00:00:00Z' })
  const edited = makeMessage({ id: 'edited', channelId: 'channel', content: 'before', createdAt: '2026-01-02T00:00:00Z' })
  const added = makeMessage({ id: 'added', channelId: 'channel', content: 'full authoritative content', createdAt: '2026-01-03T00:00:00Z' })
  putContext(channelKey('channel'), { messages: [deleted, edited], hasMore: false, hasNewer: false })
  useMessageStore.getState().hydrateFromCache('channel')
  let resolvePrefetch!: (value: unknown) => void
  jest.mocked(api.get).mockReturnValueOnce(new Promise(resolve => { resolvePrefetch = resolve }))
  jest.mocked(api.get).mockResolvedValueOnce({ messages: [added, { ...edited, content: 'after' }], hasMore: false })
  const prefetch = useMessageStore.getState().fetchMessages('channel')
  const hook = renderHook(() => useChannelSocketSync(true))
  act(() => {
    const handlers = createChannelHandlers()
    handlers.onMessageActivity({ mode: 'channel', contextId: 'channel', event: 'message:edit' })
    handlers.onMessageActivity({ mode: 'channel', contextId: 'channel', event: 'message:delete' })
    handlers.onMessageActivity({ mode: 'channel', contextId: 'channel', event: 'message:new', message: {
      id: added.id, authorId: added.authorId, content: 'truncated preview', createdAt: added.createdAt, threadParentId: null, attachments: []
    } })
    emit.mock.calls.find(call => call[0] === 'channel:watch')![2]({ ok: true })
  })
  expect(useMessageStore.getState().messages).toEqual([deleted, edited])
  await act(async () => { resolvePrefetch({ messages: [edited, deleted], hasMore: false }); await prefetch })
  await waitFor(() => expect(useMessageStore.getState().messages.map(m => [m.id, m.content])).toEqual([
    ['edited', 'after'], ['added', 'full authoritative content']
  ]))
  expect(peekContext(channelKey('channel'))?.stale).toBe(false)
  expect(api.get).toHaveBeenCalledTimes(2)
  hook.unmount()
})
