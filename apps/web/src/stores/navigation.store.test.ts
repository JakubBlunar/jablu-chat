import { useNavigationStore } from './navigation.store'
import { useChannelStore } from './channel.store'
import { useServerStore } from './server.store'
import { useMessageStore } from './message.store'
import { useDmStore } from './dm.store'
import { makeChannel, makeMessage, resetMsgSeq } from '@/test/factories'
import { api } from '@/lib/api'

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
    activeNavId: 0,
    error: null
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
  it('keeps visible history after a failed cross-channel jump and retries the exact destination', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    useServerStore.setState({ currentServerId: 's1' })
    useChannelStore.setState({
      loadedServerId: 's1',
      currentChannelId: 'ch1',
      channels: [makeChannel('ch1', 's1'), makeChannel('ch2', 's1')]
    })
    const visible = makeMessage({ id: 'visible' })
    useMessageStore.setState({ messages: [visible], loadedForChannelId: 'ch1' })
    const options = { serverId: 's1', channelId: 'ch2', scrollToMessageId: 'target' }
    await useNavigationStore.getState().navigateToChannel(options)
    expect(useMessageStore.getState().messages).toEqual([visible])
    expect(useChannelStore.getState().currentChannelId).toBe('ch1')
    expect(useNavigationStore.getState().error?.key).toBe('messageUnavailable')
    jest.mocked(api.get).mockResolvedValueOnce({ messages: [makeMessage({ id: 'target' })], hasMore: false })
    expect(await useNavigationStore.getState().error?.retry()).toBe('/channels/s1/ch2')
    expect(useNavigationStore.getState().error).toBeNull()
    expect(useChannelStore.getState().currentChannelId).toBe('ch2')
    log.mockRestore()
  })

  describe('navigateToChannel', () => {
    it('refreshes a missing channel instead of silently falling back to another one', async () => {
      useServerStore.setState({ currentServerId: 's1' })
      useChannelStore.setState({
        channels: [makeChannel('ch-old', 's1')],
        loadedServerId: 's1'
      })
      const fetch = jest.spyOn(useChannelStore.getState(), 'fetchChannels').mockImplementation(async () => {
        useChannelStore.setState({ channels: [makeChannel('ch-old', 's1'), makeChannel('ch-new', 's1')] })
      })
      const path = await useNavigationStore.getState().navigateToChannel({
        serverId: 's1',
        channelId: 'ch-new'
      })
      expect(fetch).toHaveBeenCalledWith('s1')
      expect(path).toBe('/channels/s1/ch-new')
      fetch.mockRestore()
    })

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

    // Regression: clicking the "Voice Connected" pill in MobileNavDrawer
    // invokes orchestratedGoToChannel(serverId, voiceChannelId). Without the
    // voice/forum guard, navigateToChannel would call GET
    // /api/channels/{voiceId}/messages, which the server rejects with 403
    // because messages are only available in text or forum channels.
    it('does not fetch messages when navigating to a voice channel', async () => {
      const fetchMessagesSpy = jest.fn().mockResolvedValue(undefined)
      const fetchMessagesAroundSpy = jest.fn().mockResolvedValue(undefined)
      const clearMessagesSpy = jest.fn()
      useMessageStore.setState({
        fetchMessages: fetchMessagesSpy,
        fetchMessagesAround: fetchMessagesAroundSpy,
        clearMessages: clearMessagesSpy
      } as any)

      useServerStore.setState({ currentServerId: 's1', viewMode: 'server' as any })
      useChannelStore.setState({
        channels: [
          { id: 'ch-text', serverId: 's1', name: 'general', type: 'text', position: 0 } as any,
          { id: 'ch-voice', serverId: 's1', name: 'General', type: 'voice', position: 1 } as any
        ],
        currentChannelId: 'ch-text',
        loadedServerId: 's1'
      })

      const path = await useNavigationStore.getState().navigateToChannel({
        serverId: 's1',
        channelId: 'ch-voice'
      })

      expect(path).toBe('/channels/s1/ch-voice')
      expect(fetchMessagesSpy).not.toHaveBeenCalled()
      expect(fetchMessagesAroundSpy).not.toHaveBeenCalled()
      expect(clearMessagesSpy).not.toHaveBeenCalled()
      expect(useChannelStore.getState().currentChannelId).toBe('ch-voice')
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
