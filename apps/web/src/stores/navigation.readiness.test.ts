import { api } from '@/lib/api'
import { clearCache } from '@/lib/cache/messageCache'
import { makeChannel, makeMessage } from '@/test/factories'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useMessageStore } from './message.store'
import { useNavigationStore } from './navigation.store'
import { useServerStore } from './server.store'

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), getDmMessages: jest.fn(), getDmMessagesAround: jest.fn() }
}))
jest.mock('@/lib/socket', () => ({ getSocket: () => ({ emit: jest.fn() }) }))
jest.mock('@/lib/cache/hydrate', () => ({ hydrateContextFromDisk: jest.fn().mockResolvedValue(false) }))

beforeEach(() => {
  jest.clearAllMocks()
  clearCache(false)
  useMessageStore.getState().clearMessages()
  useMessageStore.getState().setScrollToMessageId(null)
  useDmStore.getState().clearMessages()
  useDmStore.getState().setScrollToMessageId(null)
  useNavigationStore.setState({ error: null, isNavigating: false })
  useServerStore.setState({ currentServerId: 's1', viewMode: 'server' })
  useChannelStore.setState({
    currentChannelId: 'ch1', loadedServerId: 's1', channels: [makeChannel('ch1', 's1')]
  })
})

it.each([null, 'target'])('loads a selected channel with no loaded history (jump: %s)', async (scrollToMessageId) => {
  const target = makeMessage({ id: 'target', channelId: 'ch1' })
  jest.mocked(api.get).mockResolvedValue({ messages: [target], hasMore: false })
  await useNavigationStore.getState().navigateToChannel({ serverId: 's1', channelId: 'ch1', scrollToMessageId })
  expect(api.get).toHaveBeenCalledWith(scrollToMessageId
    ? '/api/channels/ch1/messages?around=target&limit=100'
    : '/api/channels/ch1/messages?limit=50')
  expect(useMessageStore.getState()).toMatchObject({ loadedForChannelId: 'ch1', messages: [target] })
  expect(useNavigationStore.getState().error).toBeNull()
})

it('fetches the full target window even if a live message arrived before channel history', async () => {
  const target = makeMessage({ id: 'target', channelId: 'ch1' })
  const older = makeMessage({ id: 'older', channelId: 'ch1' })
  useMessageStore.getState().addMessage(target)
  jest.mocked(api.get).mockResolvedValue({ messages: [target, older], hasMore: false })
  await useNavigationStore.getState().navigateToChannel({ serverId: 's1', channelId: 'ch1', scrollToMessageId: 'target' })
  expect(useMessageStore.getState()).toMatchObject({ loadedForChannelId: 'ch1', messages: [older, target] })
  expect(api.get).toHaveBeenCalledTimes(1)
})

it.each([null, 'target'])('loads a selected DM with no loaded history (jump: %s)', async (scrollToMessageId) => {
  useServerStore.setState({ viewMode: 'dm' })
  useDmStore.setState({ currentConversationId: 'dm1' })
  const target = makeMessage({ id: 'target', channelId: null, directConversationId: 'dm1' })
  jest.mocked(api.getDmMessages).mockResolvedValue({ messages: [target], hasMore: false })
  jest.mocked(api.getDmMessagesAround).mockResolvedValue({ messages: [target], hasMore: false, hasNewer: false })
  await useNavigationStore.getState().navigateToDm({ conversationId: 'dm1', scrollToMessageId })
  expect(scrollToMessageId ? api.getDmMessagesAround : api.getDmMessages).toHaveBeenCalledTimes(1)
  expect(useDmStore.getState()).toMatchObject({ loadedForConvId: 'dm1', messages: [target] })
  expect(useNavigationStore.getState().error).toBeNull()
})

it('keeps the fast path for a loaded empty channel', async () => {
  useMessageStore.setState({ loadedForChannelId: 'ch1', messages: [] })
  await useNavigationStore.getState().navigateToChannel({ serverId: 's1', channelId: 'ch1' })
  expect(api.get).not.toHaveBeenCalled()
})
