import { useMessageStore } from './message.store'
import { makeMessage, makeMessages, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockGet = jest.mocked(api.get)

function resetStore() {
  const { typingUsers } = useMessageStore.getState()
  for (const entry of typingUsers.values()) clearTimeout(entry.timeout)
  useMessageStore.setState({
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    messagesError: null,
    loadedForChannelId: null,
    typingUsers: new Map(),
    scrollToMessageId: null,
    scrollRequestNonce: 0
  })
}

beforeEach(() => {
  resetStore()
  resetMsgSeq()
  jest.clearAllMocks()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe('message.store', () => {
  describe('fetchMessages', () => {
    it('fetches initial messages and sets loadedForChannelId', async () => {
      const msgs = makeMessages(3)
      mockGet.mockResolvedValueOnce({ messages: msgs.slice().reverse(), hasMore: true })

      await useMessageStore.getState().fetchMessages('ch-1')

      const state = useMessageStore.getState()
      expect(state.messages).toHaveLength(3)
      expect(state.hasMore).toBe(true)
      expect(state.hasNewer).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.loadedForChannelId).toBe('ch-1')
    })

    it('prepends older messages when cursor is given', async () => {
      const existing = makeMessages(3)
      useMessageStore.setState({ messages: existing, loadedForChannelId: 'ch-1' })

      const older = makeMessages(2)
      mockGet.mockResolvedValueOnce({ messages: older.slice().reverse(), hasMore: false })

      await useMessageStore.getState().fetchMessages('ch-1', 'cursor-1')

      const state = useMessageStore.getState()
      expect(state.messages).toHaveLength(5)
      expect(state.hasMore).toBe(false)
    })

    it('sets messagesError on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('network'))
      await expect(useMessageStore.getState().fetchMessages('ch-1')).rejects.toThrow()
      expect(useMessageStore.getState().messagesError).toBe('Failed to load messages')
      expect(useMessageStore.getState().isLoading).toBe(false)
    })

    it('discards stale responses', async () => {
      let resolveSlow!: (v: unknown) => void
      mockGet.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r }))
      const firstFetch = useMessageStore.getState().fetchMessages('ch-1')

      mockGet.mockResolvedValueOnce({ messages: makeMessages(2).reverse(), hasMore: false })
      await useMessageStore.getState().fetchMessages('ch-2')

      resolveSlow({ messages: makeMessages(5).reverse(), hasMore: true })
      await firstFetch

      expect(useMessageStore.getState().loadedForChannelId).toBe('ch-2')
      expect(useMessageStore.getState().messages).toHaveLength(2)
    })
  })

  describe('fetchMessagesAround', () => {
    it('loads messages around a target message', async () => {
      const msgs = makeMessages(5)
      mockGet.mockResolvedValueOnce({ messages: msgs.reverse(), hasMore: true, hasNewer: true })

      await useMessageStore.getState().fetchMessagesAround('ch-1', 'msg-target')

      const state = useMessageStore.getState()
      expect(state.messages).toHaveLength(5)
      expect(state.hasMore).toBe(true)
      expect(state.hasNewer).toBe(true)
      expect(state.loadedForChannelId).toBe('ch-1')
    })
  })

  describe('fetchNewerMessages', () => {
    it('does nothing when messages are empty', async () => {
      await useMessageStore.getState().fetchNewerMessages('ch-1')
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('appends newer messages', async () => {
      const existing = makeMessages(3)
      useMessageStore.setState({ messages: existing, loadedForChannelId: 'ch-1' })

      const newer = makeMessages(2)
      mockGet.mockResolvedValueOnce({ messages: newer.reverse(), hasNewer: false })

      await useMessageStore.getState().fetchNewerMessages('ch-1')

      expect(useMessageStore.getState().messages).toHaveLength(5)
      expect(useMessageStore.getState().hasNewer).toBe(false)
    })
  })

  describe('addMessage', () => {
    it('appends when at live tail', () => {
      useMessageStore.setState({ messages: makeMessages(2), hasNewer: false })
      useMessageStore.getState().addMessage(makeMessage())
      expect(useMessageStore.getState().messages).toHaveLength(3)
    })

    it('skips when hasNewer (not at live tail)', () => {
      useMessageStore.setState({ messages: makeMessages(2), hasNewer: true })
      useMessageStore.getState().addMessage(makeMessage())
      expect(useMessageStore.getState().messages).toHaveLength(2)
    })

    it('deduplicates by id', () => {
      const msgs = makeMessages(2)
      useMessageStore.setState({ messages: msgs, hasNewer: false })
      useMessageStore.getState().addMessage(msgs[0])
      expect(useMessageStore.getState().messages).toHaveLength(2)
    })
  })

  describe('updateMessage / removeMessage', () => {
    it('updates matching message', () => {
      const msgs = makeMessages(3)
      useMessageStore.setState({ messages: msgs })
      useMessageStore.getState().updateMessage({ ...msgs[1], content: 'edited' })
      expect(useMessageStore.getState().messages[1].content).toBe('edited')
    })

    it('removes matching message', () => {
      const msgs = makeMessages(3)
      useMessageStore.setState({ messages: msgs })
      useMessageStore.getState().removeMessage(msgs[0].id)
      expect(useMessageStore.getState().messages).toHaveLength(2)
    })
  })

  describe('clearMessages', () => {
    it('clears messages, typing users, and resets flags', () => {
      useMessageStore.setState({
        messages: makeMessages(5),
        hasMore: true,
        hasNewer: true,
        loadedForChannelId: 'ch-1'
      })
      useMessageStore.getState().clearMessages()
      const state = useMessageStore.getState()
      expect(state.messages).toEqual([])
      expect(state.hasMore).toBe(false)
      expect(state.hasNewer).toBe(false)
      expect(state.loadedForChannelId).toBeNull()
      expect(state.typingUsers.size).toBe(0)
    })
  })

  describe('reactions', () => {
    it('addReaction creates a new reaction group', () => {
      const msgs = makeMessages(1)
      useMessageStore.setState({ messages: msgs })
      useMessageStore.getState().addReaction(msgs[0].id, '👍', 'user-1')

      const reactions = useMessageStore.getState().messages[0].reactions
      expect(reactions).toHaveLength(1)
      expect(reactions![0]).toMatchObject({ emoji: '👍', count: 1, userIds: ['user-1'] })
    })

    it('addReaction increments existing reaction', () => {
      const msg = makeMessage({ reactions: [{ emoji: '👍', count: 1, userIds: ['user-1'], isCustom: false }] })
      useMessageStore.setState({ messages: [msg] })
      useMessageStore.getState().addReaction(msg.id, '👍', 'user-2')

      const r = useMessageStore.getState().messages[0].reactions![0]
      expect(r.count).toBe(2)
      expect(r.userIds).toEqual(['user-1', 'user-2'])
    })

    it('addReaction ignores duplicate user', () => {
      const msg = makeMessage({ reactions: [{ emoji: '👍', count: 1, userIds: ['user-1'], isCustom: false }] })
      useMessageStore.setState({ messages: [msg] })
      useMessageStore.getState().addReaction(msg.id, '👍', 'user-1')

      expect(useMessageStore.getState().messages[0].reactions![0].count).toBe(1)
    })

    it('removeReaction removes user and decrements count', () => {
      const msg = makeMessage({ reactions: [{ emoji: '👍', count: 2, userIds: ['user-1', 'user-2'], isCustom: false }] })
      useMessageStore.setState({ messages: [msg] })
      useMessageStore.getState().removeReaction(msg.id, '👍', 'user-1')

      const r = useMessageStore.getState().messages[0].reactions![0]
      expect(r.count).toBe(1)
      expect(r.userIds).toEqual(['user-2'])
    })

    it('removeReaction removes the group when count reaches 0', () => {
      const msg = makeMessage({ reactions: [{ emoji: '👍', count: 1, userIds: ['user-1'], isCustom: false }] })
      useMessageStore.setState({ messages: [msg] })
      useMessageStore.getState().removeReaction(msg.id, '👍', 'user-1')

      expect(useMessageStore.getState().messages[0].reactions).toEqual([])
    })

    it('addReaction/removeReaction no-ops for unknown message', () => {
      useMessageStore.setState({ messages: makeMessages(1) })
      useMessageStore.getState().addReaction('nonexistent', '👍', 'user-1')
      useMessageStore.getState().removeReaction('nonexistent', '👍', 'user-1')
      expect(useMessageStore.getState().messages).toHaveLength(1)
    })
  })

  describe('setScrollToMessageId', () => {
    it('sets target and increments nonce', () => {
      const before = useMessageStore.getState().scrollRequestNonce
      useMessageStore.getState().setScrollToMessageId('msg-5')
      expect(useMessageStore.getState().scrollToMessageId).toBe('msg-5')
      expect(useMessageStore.getState().scrollRequestNonce).toBe(before + 1)
    })

    it('does not increment nonce when clearing', () => {
      useMessageStore.getState().setScrollToMessageId('msg-1')
      const nonce = useMessageStore.getState().scrollRequestNonce
      useMessageStore.getState().setScrollToMessageId(null)
      expect(useMessageStore.getState().scrollRequestNonce).toBe(nonce)
    })
  })

  describe('typing users', () => {
    it('setTypingUser adds and auto-removes after timeout', () => {
      useMessageStore.getState().setTypingUser('ch-1', 'user-1', 'alice')
      expect(useMessageStore.getState().typingUsers.has('user-1')).toBe(true)

      jest.advanceTimersByTime(3000)
      expect(useMessageStore.getState().typingUsers.has('user-1')).toBe(false)
    })

    it('setTypingUser resets timeout for same user', () => {
      useMessageStore.getState().setTypingUser('ch-1', 'user-1', 'alice')
      jest.advanceTimersByTime(2000)
      useMessageStore.getState().setTypingUser('ch-1', 'user-1', 'alice')
      jest.advanceTimersByTime(2000)

      expect(useMessageStore.getState().typingUsers.has('user-1')).toBe(true)

      jest.advanceTimersByTime(1000)
      expect(useMessageStore.getState().typingUsers.has('user-1')).toBe(false)
    })

    it('removeTypingUser removes immediately', () => {
      useMessageStore.getState().setTypingUser('ch-1', 'user-1', 'alice')
      useMessageStore.getState().removeTypingUser('user-1')
      expect(useMessageStore.getState().typingUsers.has('user-1')).toBe(false)
    })
  })

  describe('setLinkPreviews / updatePoll / updateThreadCount', () => {
    it('setLinkPreviews attaches previews to a message', () => {
      const msgs = makeMessages(2)
      useMessageStore.setState({ messages: msgs })
      const previews = [{ url: 'https://example.com', title: 'Ex' }] as any
      useMessageStore.getState().setLinkPreviews(msgs[0].id, previews)
      expect(useMessageStore.getState().messages[0].linkPreviews).toEqual(previews)
    })

    it('updateThreadCount updates the thread metadata', () => {
      const msgs = makeMessages(2)
      useMessageStore.setState({ messages: msgs })
      useMessageStore.getState().updateThreadCount(msgs[1].id, 5)
      expect(useMessageStore.getState().messages[1].threadCount).toBe(5)
    })
  })
})
