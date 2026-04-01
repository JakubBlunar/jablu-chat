import { useDmStore } from './dm.store'
import { makeMessage, makeMessages, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: {
    getDmConversations: jest.fn(),
    getDmMessages: jest.fn(),
    getDmMessagesAround: jest.fn(),
    getDmMessagesAfter: jest.fn(),
    closeDm: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockApi = {
  getDmConversations: jest.mocked(api.getDmConversations),
  getDmMessages: jest.mocked(api.getDmMessages),
  getDmMessagesAround: jest.mocked(api.getDmMessagesAround),
  getDmMessagesAfter: jest.mocked(api.getDmMessagesAfter),
  closeDm: jest.mocked(api.closeDm)
}

function resetStore() {
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

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    participants: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    lastMessage: null,
    ...overrides
  } as any
}

beforeEach(() => {
  resetStore()
  resetMsgSeq()
  jest.clearAllMocks()
})

describe('dm.store', () => {
  describe('fetchConversations', () => {
    it('loads conversations', async () => {
      const convs = [makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })]
      mockApi.getDmConversations.mockResolvedValueOnce(convs)

      await useDmStore.getState().fetchConversations()

      expect(useDmStore.getState().conversations).toHaveLength(2)
      expect(useDmStore.getState().isConversationsLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApi.getDmConversations.mockRejectedValueOnce(new Error('fail'))
      await useDmStore.getState().fetchConversations()

      expect(useDmStore.getState().conversationsError).toBe('Failed to load conversations')
      expect(useDmStore.getState().isConversationsLoading).toBe(false)
    })
  })

  describe('fetchMessages', () => {
    it('fetches initial messages', async () => {
      const msgs = makeMessages(3)
      mockApi.getDmMessages.mockResolvedValueOnce({ messages: msgs.slice().reverse(), hasMore: true })

      await useDmStore.getState().fetchMessages('conv-1')

      const state = useDmStore.getState()
      expect(state.messages).toHaveLength(3)
      expect(state.hasMore).toBe(true)
      expect(state.hasNewer).toBe(false)
      expect(state.loadedForConvId).toBe('conv-1')
    })

    it('prepends older messages with cursor', async () => {
      const existing = makeMessages(3)
      useDmStore.setState({ messages: existing, loadedForConvId: 'conv-1' })

      const older = makeMessages(2)
      mockApi.getDmMessages.mockResolvedValueOnce({ messages: older.slice().reverse(), hasMore: false })

      await useDmStore.getState().fetchMessages('conv-1', 'cursor-1')

      expect(useDmStore.getState().messages).toHaveLength(5)
    })

    it('sets error on failure', async () => {
      mockApi.getDmMessages.mockRejectedValueOnce(new Error('fail'))
      await useDmStore.getState().fetchMessages('conv-1')

      expect(useDmStore.getState().messagesError).toBe('Failed to load messages')
    })
  })

  describe('addMessage / updateMessage / removeMessage', () => {
    it('appends at live tail', () => {
      useDmStore.setState({ messages: makeMessages(2), hasNewer: false })
      useDmStore.getState().addMessage(makeMessage())
      expect(useDmStore.getState().messages).toHaveLength(3)
    })

    it('skips when not at live tail', () => {
      useDmStore.setState({ messages: makeMessages(2), hasNewer: true })
      useDmStore.getState().addMessage(makeMessage())
      expect(useDmStore.getState().messages).toHaveLength(2)
    })

    it('deduplicates', () => {
      const msgs = makeMessages(2)
      useDmStore.setState({ messages: msgs, hasNewer: false })
      useDmStore.getState().addMessage(msgs[0])
      expect(useDmStore.getState().messages).toHaveLength(2)
    })

    it('updates matching message', () => {
      const msgs = makeMessages(3)
      useDmStore.setState({ messages: msgs })
      useDmStore.getState().updateMessage({ ...msgs[1], content: 'edited' })
      expect(useDmStore.getState().messages[1].content).toBe('edited')
    })

    it('removes matching message', () => {
      const msgs = makeMessages(3)
      useDmStore.setState({ messages: msgs })
      useDmStore.getState().removeMessage(msgs[1].id)
      expect(useDmStore.getState().messages).toHaveLength(2)
    })
  })

  describe('reactions', () => {
    it('addReaction creates a new reaction group', () => {
      const msgs = makeMessages(1)
      useDmStore.setState({ messages: msgs })
      useDmStore.getState().addReaction(msgs[0].id, '❤️', 'user-1')

      const r = useDmStore.getState().messages[0].reactions!
      expect(r).toHaveLength(1)
      expect(r[0]).toMatchObject({ emoji: '❤️', count: 1, userIds: ['user-1'] })
    })

    it('removeReaction removes group when count hits 0', () => {
      const msg = makeMessage({ reactions: [{ emoji: '❤️', count: 1, userIds: ['user-1'], isCustom: false }] })
      useDmStore.setState({ messages: [msg] })
      useDmStore.getState().removeReaction(msg.id, '❤️', 'user-1')

      expect(useDmStore.getState().messages[0].reactions).toEqual([])
    })
  })

  describe('updateConversationLastMessage', () => {
    it('updates the last message and re-sorts by recency', () => {
      const c1 = makeConversation({ id: 'c1', createdAt: '2025-01-01T00:00:00Z' })
      const c2 = makeConversation({ id: 'c2', createdAt: '2025-01-02T00:00:00Z' })
      useDmStore.setState({ conversations: [c2, c1] })

      useDmStore.getState().updateConversationLastMessage('c1', {
        content: 'hey',
        authorId: 'user-1',
        createdAt: '2025-01-03T00:00:00Z'
      })

      const convs = useDmStore.getState().conversations
      expect(convs[0].id).toBe('c1')
    })
  })

  describe('addOrUpdateConversation', () => {
    it('prepends a new conversation', () => {
      useDmStore.setState({ conversations: [makeConversation({ id: 'c1' })] })
      useDmStore.getState().addOrUpdateConversation(makeConversation({ id: 'c2' }))
      expect(useDmStore.getState().conversations).toHaveLength(2)
      expect(useDmStore.getState().conversations[0].id).toBe('c2')
    })

    it('merges into existing conversation', () => {
      const c = makeConversation({ id: 'c1' })
      useDmStore.setState({ conversations: [c] })
      useDmStore.getState().addOrUpdateConversation({ ...c, lastMessage: { content: 'hi' } } as any)

      expect(useDmStore.getState().conversations).toHaveLength(1)
      expect(useDmStore.getState().conversations[0].lastMessage).toEqual({ content: 'hi' })
    })
  })

  describe('closeConversation', () => {
    it('optimistically removes conversation and clears currentConversationId', async () => {
      mockApi.closeDm.mockResolvedValueOnce(undefined)
      useDmStore.setState({
        conversations: [makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })],
        currentConversationId: 'c1'
      })

      await useDmStore.getState().closeConversation('c1')

      expect(useDmStore.getState().conversations).toHaveLength(1)
      expect(useDmStore.getState().currentConversationId).toBeNull()
    })

    it('keeps conversation removed even when API fails', async () => {
      mockApi.closeDm.mockRejectedValueOnce(new Error('fail'))
      useDmStore.setState({ conversations: [makeConversation({ id: 'c1' })] })

      await useDmStore.getState().closeConversation('c1')
      expect(useDmStore.getState().conversations).toHaveLength(0)
    })
  })

  describe('setScrollToMessageId', () => {
    it('sets target and increments nonce', () => {
      const before = useDmStore.getState().scrollRequestNonce
      useDmStore.getState().setScrollToMessageId('msg-5')
      expect(useDmStore.getState().scrollToMessageId).toBe('msg-5')
      expect(useDmStore.getState().scrollRequestNonce).toBe(before + 1)
    })

    it('does not increment nonce when clearing', () => {
      useDmStore.getState().setScrollToMessageId('msg-1')
      const nonce = useDmStore.getState().scrollRequestNonce
      useDmStore.getState().setScrollToMessageId(null)
      expect(useDmStore.getState().scrollRequestNonce).toBe(nonce)
    })
  })
})
