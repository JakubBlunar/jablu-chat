import { useForumReplyStore } from './forumReply.store'
import { makeMessage, makeMessages, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: {
    getThreadMessages: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockApi = jest.mocked(api.getThreadMessages)

function resetStore() {
  useForumReplyStore.setState({
    channelId: null,
    postId: null,
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    focusMessageId: null,
    scrollToMessageId: null,
    scrollRequestNonce: 0,
    loadedForPostId: null
  })
}

beforeEach(() => {
  resetStore()
  resetMsgSeq()
  jest.clearAllMocks()
})

describe('forumReply.store', () => {
  describe('fetchMessages', () => {
    it('does nothing when channelId or postId is null', async () => {
      await useForumReplyStore.getState().fetchMessages()
      expect(mockApi).not.toHaveBeenCalled()
      expect(useForumReplyStore.getState().isLoading).toBe(false)
    })

    it('fetches latest messages without focusMessageId', async () => {
      const msgs = makeMessages(3)
      mockApi.mockResolvedValueOnce({ messages: msgs, hasMore: true, hasNewer: undefined })

      useForumReplyStore.setState({ channelId: 'ch-1', postId: 'post-1' })
      await useForumReplyStore.getState().fetchMessages()

      expect(mockApi).toHaveBeenCalledWith('ch-1', 'post-1', undefined)
      const state = useForumReplyStore.getState()
      expect(state.messages).toHaveLength(3)
      expect(state.hasMore).toBe(true)
      expect(state.hasNewer).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.loadedForPostId).toBe('post-1')
    })

    it('fetches around focusMessageId when set', async () => {
      const msgs = makeMessages(5)
      mockApi.mockResolvedValueOnce({ messages: msgs, hasMore: true, hasNewer: true })

      useForumReplyStore.setState({ channelId: 'ch-1', postId: 'post-1', focusMessageId: 'msg-target' })
      await useForumReplyStore.getState().fetchMessages()

      expect(mockApi).toHaveBeenCalledWith('ch-1', 'post-1', { around: 'msg-target' })
      const state = useForumReplyStore.getState()
      expect(state.hasMore).toBe(true)
      expect(state.hasNewer).toBe(true)
    })

    it('sets isLoading false on error', async () => {
      mockApi.mockRejectedValueOnce(new Error('fail'))
      useForumReplyStore.setState({ channelId: 'ch-1', postId: 'post-1' })
      await useForumReplyStore.getState().fetchMessages()
      expect(useForumReplyStore.getState().isLoading).toBe(false)
    })
  })

  describe('fetchOlder', () => {
    it('does nothing when already loading', async () => {
      useForumReplyStore.setState({
        channelId: 'ch-1', postId: 'post-1',
        messages: makeMessages(2), isLoading: true
      })
      await useForumReplyStore.getState().fetchOlder()
      expect(mockApi).not.toHaveBeenCalled()
    })

    it('does nothing when messages are empty', async () => {
      useForumReplyStore.setState({ channelId: 'ch-1', postId: 'post-1', messages: [] })
      await useForumReplyStore.getState().fetchOlder()
      expect(mockApi).not.toHaveBeenCalled()
    })

    it('prepends older messages', async () => {
      const existing = makeMessages(2)
      const older = makeMessages(3)
      mockApi.mockResolvedValueOnce({ messages: older, hasMore: false })

      useForumReplyStore.setState({ channelId: 'ch-1', postId: 'post-1', messages: existing })
      await useForumReplyStore.getState().fetchOlder()

      expect(mockApi).toHaveBeenCalledWith('ch-1', 'post-1', { cursor: existing[0].id })
      const state = useForumReplyStore.getState()
      expect(state.messages).toHaveLength(5)
      expect(state.messages[0].id).toBe(older[0].id)
      expect(state.hasMore).toBe(false)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('fetchNewer', () => {
    it('does nothing when hasNewer is false', async () => {
      useForumReplyStore.setState({
        channelId: 'ch-1', postId: 'post-1',
        messages: makeMessages(2), hasNewer: false
      })
      await useForumReplyStore.getState().fetchNewer()
      expect(mockApi).not.toHaveBeenCalled()
    })

    it('appends newer messages and deduplicates', async () => {
      const existing = makeMessages(2)
      const newer = [existing[1], makeMessage()]
      mockApi.mockResolvedValueOnce({ messages: newer, hasMore: false, hasNewer: false })

      useForumReplyStore.setState({
        channelId: 'ch-1', postId: 'post-1',
        messages: existing, hasNewer: true
      })
      await useForumReplyStore.getState().fetchNewer()

      const state = useForumReplyStore.getState()
      expect(state.messages).toHaveLength(3)
      expect(state.hasNewer).toBe(false)
    })
  })

  describe('clearMessages', () => {
    it('clears messages, resets pagination flags, and clears loadedForPostId', () => {
      useForumReplyStore.setState({
        messages: makeMessages(5),
        hasMore: true,
        hasNewer: true,
        loadedForPostId: 'post-1'
      })
      useForumReplyStore.getState().clearMessages()
      const state = useForumReplyStore.getState()
      expect(state.messages).toEqual([])
      expect(state.hasMore).toBe(false)
      expect(state.hasNewer).toBe(false)
      expect(state.loadedForPostId).toBeNull()
    })
  })

  describe('setScrollToMessageId', () => {
    it('sets the scroll target and increments nonce', () => {
      const before = useForumReplyStore.getState().scrollRequestNonce
      useForumReplyStore.getState().setScrollToMessageId('msg-42')
      const state = useForumReplyStore.getState()
      expect(state.scrollToMessageId).toBe('msg-42')
      expect(state.scrollRequestNonce).toBe(before + 1)
    })

    it('does not increment nonce when setting to null', () => {
      useForumReplyStore.getState().setScrollToMessageId('msg-1')
      const nonce = useForumReplyStore.getState().scrollRequestNonce
      useForumReplyStore.getState().setScrollToMessageId(null)
      expect(useForumReplyStore.getState().scrollRequestNonce).toBe(nonce)
    })
  })

  describe('live update actions', () => {
    it('addMessage appends when at live tail', () => {
      useForumReplyStore.setState({ messages: makeMessages(2), hasNewer: false })
      const newMsg = makeMessage()
      useForumReplyStore.getState().addMessage(newMsg)
      expect(useForumReplyStore.getState().messages).toHaveLength(3)
    })

    it('addMessage skips when hasNewer (not at live tail)', () => {
      useForumReplyStore.setState({ messages: makeMessages(2), hasNewer: true })
      useForumReplyStore.getState().addMessage(makeMessage())
      expect(useForumReplyStore.getState().messages).toHaveLength(2)
    })

    it('addMessage deduplicates', () => {
      const msgs = makeMessages(2)
      useForumReplyStore.setState({ messages: msgs, hasNewer: false })
      useForumReplyStore.getState().addMessage(msgs[0])
      expect(useForumReplyStore.getState().messages).toHaveLength(2)
    })

    it('updateMessage replaces by id', () => {
      const msgs = makeMessages(3)
      useForumReplyStore.setState({ messages: msgs })
      const updated = { ...msgs[1], content: 'edited' }
      useForumReplyStore.getState().updateMessage(updated)
      expect(useForumReplyStore.getState().messages[1].content).toBe('edited')
    })

    it('removeMessage filters by id', () => {
      const msgs = makeMessages(3)
      useForumReplyStore.setState({ messages: msgs })
      useForumReplyStore.getState().removeMessage(msgs[1].id)
      expect(useForumReplyStore.getState().messages).toHaveLength(2)
      expect(useForumReplyStore.getState().messages.find((m) => m.id === msgs[1].id)).toBeUndefined()
    })
  })
})
