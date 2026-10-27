import { act, renderHook } from '@testing-library/react'
import { useChannelSocketSync } from './useChannelSocketSync'
import { getSocket } from '@/lib/socket'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { useMessageStore } from '@/stores/message.store'
import { useDmStore } from '@/stores/dm.store'
import { useForumStore } from '@/stores/forum.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumReplyStore } from '@/stores/forumReply.store'

jest.mock('@/lib/socket', () => ({ getSocket: jest.fn() }))
const socket = { emit: jest.fn(), on: jest.fn(), off: jest.fn() }
const refresh = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSocket).mockReturnValue(socket as never)
  useServerStore.setState({ viewMode: 'server' })
  useChannelStore.setState({ currentChannelId: 'first' })
  useMessageStore.setState({ isLoading: false, loadedForChannelId: 'first', revalidate: refresh })
  useDmStore.setState({ currentConversationId: null, isLoading: false })
  useForumStore.setState({ channelId: null, isLoading: false })
  useThreadStore.setState({ isOpen: false, isLoading: false })
  useForumReplyStore.setState({ channelId: null, isLoading: false })
})
function ack(channelId: string) {
  return socket.emit.mock.calls.find(
    (call) => call[0] === 'channel:watch' && call[1].channelId === channelId
  )![2] as (result: { ok: boolean }) => void
}

it('refreshes after the watch ack and after an earlier prefetch has finished', () => {
  useMessageStore.setState({ isLoading: true })
  const hook = renderHook(() => useChannelSocketSync(true))
  act(() => ack('first')({ ok: true }))
  expect(refresh).not.toHaveBeenCalled()
  act(() => useMessageStore.setState({ isLoading: false }))
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(refresh).toHaveBeenCalledWith('first')
  hook.unmount()
})

it('ignores old acknowledgements after switching and restores subscriptions after reconnect', () => {
  const hook = renderHook(({ connected }) => useChannelSocketSync(connected), { initialProps: { connected: true } })
  const oldAck = ack('first')
  act(() => {
    useChannelStore.setState({ currentChannelId: 'second' })
    useMessageStore.setState({ loadedForChannelId: 'second' })
  })
  act(() => oldAck({ ok: true }))
  expect(refresh).not.toHaveBeenCalled()
  act(() => ack('second')({ ok: true }))
  expect(refresh).toHaveBeenCalledWith('second')
  hook.rerender({ connected: false })
  socket.emit.mockClear()
  hook.rerender({ connected: true })
  expect(socket.emit).toHaveBeenCalledWith('channel:watch', { channelId: 'second' }, expect.any(Function))
  hook.unmount()
})
