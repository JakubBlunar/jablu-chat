import { useNavigationStore } from './navigation.store'
import { useChannelStore } from './channel.store'
import { useServerStore } from './server.store'
import { useMessageStore } from './message.store'
import { useDmStore } from './dm.store'
import { makeMessage, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({ messages: [], hasMore: false }),
    getDmMessages: jest.fn().mockResolvedValue({ messages: [], hasMore: false }),
    getDmMessagesAround: jest.fn().mockResolvedValue({ messages: [], hasMore: false, hasNewer: false })
  }
}))

jest.mock('@/lib/socket', () => ({
  getSocket: jest.fn(() => ({
    emit: jest.fn()
  }))
}))

jest.mock('./channel-permissions.store', () => ({
  useChannelPermissionsStore: {
    getState: () => ({
      fetchChannelPermissions: jest.fn().mockResolvedValue(undefined)
    })
  }
}))

jest.mock('./member.store', () => ({
  useMemberStore: {
    getState: () => ({
      fetchMembers: jest.fn().mockResolvedValue(undefined)
    })
  }
}))

function resetStores() {
  useNavigationStore.setState({
    isNavigating: false,
    navigatingToServerId: null,
    activeNavId: 0
  })
  useServerStore.setState({
    servers: [],
    currentServerId: null,
    viewMode: 'server' as any,
    isLoading: false
  })
  useChannelStore.setState({
    channels: [],
    categories: [],
    currentChannelId: null,
    isLoading: false,
    loadedServerId: null
  })
  useMessageStore.getState().clearMessages()
  useDmStore.setState({
    conversations: [],
    currentConversationId: null,
    messages: [],
    hasMore: false,
    hasNewer: false,
    isLoading: false,
    isConversationsLoading: false,
    conversationsError: null,
    messagesError: null,
    loadedForConvId: null,
    scrollToMessageId: null,
    scrollRequestNonce: 0
  })
}

beforeEach(() => {
  resetStores()
  resetMsgSeq()
  jest.clearAllMocks()
})

describe('navigation.store', () => {
  describe('navigateToChannel', () => {
    it('returns a path with the fallback first text channel', async () => {
      useChannelStore.setState({
        channels: [
          { id: 'ch-v', serverId: 's1', name: 'voice', type: 'voice', position: 0 } as any,
          { id: 'ch-t', serverId: 's1', name: 'general', type: 'text', position: 0 } as any
        ],
        loadedServerId: 's1'
      })
      useServerStore.setState({ currentServerId: 's1' })

      const path = await useNavigationStore.getState().navigateToChannel({ serverId: 's1' })

      expect(path).toBe('/channels/s1/ch-t')
      expect(useNavigationStore.getState().isNavigating).toBe(false)
    })

    it('returns server-only path when no text channels exist', async () => {
      useChannelStore.setState({ channels: [], loadedServerId: 's1' })
      useServerStore.setState({ currentServerId: 's1' })

      const path = await useNavigationStore.getState().navigateToChannel({ serverId: 's1' })
      expect(path).toBe('/channels/s1')
    })

    it('short-circuits scroll-to-message for same channel', async () => {
      useServerStore.setState({ currentServerId: 's1', viewMode: 'server' as any })
      useChannelStore.setState({
        channels: [{ id: 'ch-1', serverId: 's1', name: 'general', type: 'text', position: 0 } as any],
        currentChannelId: 'ch-1',
        loadedServerId: 's1'
      })
      const msg = makeMessage({ id: 'msg-target' })
      useMessageStore.setState({ messages: [msg], loadedForChannelId: 'ch-1' })

      const path = await useNavigationStore.getState().navigateToChannel({
        serverId: 's1',
        channelId: 'ch-1',
        scrollToMessageId: 'msg-target'
      })

      expect(path).toBeNull()
      expect(useMessageStore.getState().scrollToMessageId).toBe('msg-target')
    })
  })

  describe('navigateToDm', () => {
    it('returns a DM path', async () => {
      const path = await useNavigationStore.getState().navigateToDm({ conversationId: 'conv-1' })

      expect(path).toBe('/channels/@me/conv-1')
      expect(useNavigationStore.getState().isNavigating).toBe(false)
    })

    it('short-circuits scroll-to-message for same conversation', async () => {
      useServerStore.setState({ viewMode: 'dm' as any })
      const msg = makeMessage({ id: 'msg-target' })
      useDmStore.setState({
        currentConversationId: 'conv-1',
        messages: [msg],
        loadedForConvId: 'conv-1'
      })

      const path = await useNavigationStore.getState().navigateToDm({
        conversationId: 'conv-1',
        scrollToMessageId: 'msg-target'
      })

      expect(path).toBeNull()
      expect(useDmStore.getState().scrollToMessageId).toBe('msg-target')
    })
  })
})
