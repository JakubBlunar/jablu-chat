import { useThreadStore } from './thread.store'
import { makeMessage, makeMessages, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: {
    getThreadMessages: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockApi = jest.mocked(api.getThreadMessages)

function resetStore() {
  useThreadStore.setState({
    isOpen: false,
    parentMessage: null,
    channelId: null,
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    focusMessageId: null,
    scrollToMessageId: null,
    scrollRequestNonce: 0,
    loadedForParentId: null
  })
}

beforeEach(() => {
  resetStore()
  resetMsgSeq()
  jest.clearAllMocks()
})

describe('thread.store', () => {
  const parentMsg = makeMessage({ id: 'parent-1', content: 'thread root' })

  describe('openThread', () => {
    it('opens a new thread and resets state', () => {
      useThreadStore.getState().openThread('ch-1', parentMsg)
      const state = useThreadStore.getState()
      expect(state.isOpen).toBe(true)
      expect(state.parentMessage?.id).toBe('parent-1')
      expect(state.channelId).toBe('ch-1')
      expect(state.messages).toEqual([])
      expect(state.isLoading).toBe(true)
      expect(state.loadedForParentId).toBeNull()
    })

    it('sets focusMessageId when provided', () => {
      useThreadStore.getState().openThread('ch-1', parentMsg, { focusMessageId: 'reply-5' })
      const state = useThreadStore.getState()
      expect(state.focusMessageId).toBe('reply-5')
      expect(state.scrollToMessageId).toBe('reply-5')
    })

    it('is idempotent for the same thread without focus', () => {
      useThreadStore.getState().openThread('ch-1', parentMsg)
      const nonce1 = useThreadStore.getState().scrollRequestNonce
      useThreadStore.setState({ messages: makeMessages(3), isLoading: false })

      useThreadStore.getState().openThread('ch-1', parentMsg)
      const state = useThreadStore.getState()
      expect(state.messages).toHaveLength(3)
      expect(state.scrollRequestNonce).toBe(nonce1)
    })

    it('updates scroll target when reopening same thread with focus', () => {
      useThreadStore.getState().openThread('ch-1', parentMsg)
      const nonce1 = useThreadStore.getState().scrollRequestNonce

      useThreadStore.getState().openThread('ch-1', parentMsg, { focusMessageId: 'reply-10' })
      const state = useThreadStore.getState()
      expect(state.scrollToMessageId).toBe('reply-10')
      expect(state.scrollRequestNonce).toBe(nonce1 + 1)
    })
  })

  describe('closeThread', () => {
    it('resets all state', () => {
      useThreadStore.getState().openThread('ch-1', parentMsg)
      useThreadStore.setState({ messages: makeMessages(5) })

      useThreadStore.getState().closeThread()
      const state = useThreadStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.parentMessage).toBeNull()
      expect(state.channelId).toBeNull()
      expect(state.messages).toEqual([])
      expect(state.loadedForParentId).toBeNull()
    })
  })

  describe('fetchMessages', () => {
    it('does nothing when channelId or parentMessage is null', async () => {
      await useThreadStore.getState().fetchMessages()
      expect(mockApi).not.toHaveBeenCalled()
    })

    it('fetches and stores messages', async () => {
      const msgs = makeMessages(4)
      mockApi.mockResolvedValueOnce({ messages: msgs, hasMore: true, hasNewer: false })

      useThreadStore.getState().openThread('ch-1', parentMsg)
      await useThreadStore.getState().fetchMessages()

      expect(mockApi).toHaveBeenCalledWith('ch-1', 'parent-1', undefined)
      const state = useThreadStore.getState()
      expect(state.messages).toHaveLength(4)
      expect(state.hasMore).toBe(true)
      expect(state.isLoading).toBe(false)
      expect(state.loadedForParentId).toBe('parent-1')
    })

    it('fetches with around when focusMessageId is set', async () => {
      mockApi.mockResolvedValueOnce({ messages: makeMessages(5), hasMore: true, hasNewer: true })

      useThreadStore.getState().openThread('ch-1', parentMsg, { focusMessageId: 'reply-5' })
      await useThreadStore.getState().fetchMessages()

      expect(mockApi).toHaveBeenCalledWith('ch-1', 'parent-1', { around: 'reply-5' })
    })

    it('sets isLoading false on error', async () => {
      mockApi.mockRejectedValueOnce(new Error('network'))
      useThreadStore.getState().openThread('ch-1', parentMsg)
      await useThreadStore.getState().fetchMessages()
      expect(useThreadStore.getState().isLoading).toBe(false)
    })
  })

  describe('fetchMore (older)', () => {
    it('guards against empty messages or already loading', async () => {
      useThreadStore.getState().openThread('ch-1', parentMsg)
      useThreadStore.setState({ messages: [], isLoading: false })
      await useThreadStore.getState().fetchMore()
      expect(mockApi).not.toHaveBeenCalled()
    })

    it('prepends older messages', async () => {
      const existing = makeMessages(3, { threadParentId: 'parent-1' })
      const older = makeMessages(2, { threadParentId: 'parent-1' })
      mockApi.mockResolvedValueOnce({ messages: older, hasMore: false })

      useThreadStore.getState().openThread('ch-1', parentMsg)
      useThreadStore.setState({ messages: existing, isLoading: false })
      await useThreadStore.getState().fetchMore()

      const state = useThreadStore.getState()
      expect(state.messages).toHaveLength(5)
      expect(state.messages[0].id).toBe(older[0].id)
    })
  })

  describe('live update actions', () => {
    it('addMessage appends when at live tail and matches thread', () => {
      useThreadStore.getState().openThread('ch-1', parentMsg)
      useThreadStore.setState({ messages: makeMessages(2), isLoading: false, hasNewer: false })

      const reply = makeMessage({ threadParentId: 'parent-1' })
      useThreadStore.getState().addMessage(reply)
      expect(useThreadStore.getState().messages).toHaveLength(3)
    })

    it('addMessage ignores messages from different threads', () => {
      useThreadStore.getState().openThread('ch-1', parentMsg)
      useThreadStore.setState({ messages: makeMessages(2), isLoading: false, hasNewer: false })

      const reply = makeMessage({ threadParentId: 'other-thread' })
      useThreadStore.getState().addMessage(reply)
      expect(useThreadStore.getState().messages).toHaveLength(2)
    })

    it('updateMessage replaces matching message', () => {
      const msgs = makeMessages(3)
      useThreadStore.setState({ messages: msgs })
      useThreadStore.getState().updateMessage({ ...msgs[1], content: 'updated' })
      expect(useThreadStore.getState().messages[1].content).toBe('updated')
    })

    it('deleteMessage removes matching message', () => {
      const msgs = makeMessages(3)
      useThreadStore.setState({ messages: msgs })
      useThreadStore.getState().deleteMessage(msgs[0].id)
      expect(useThreadStore.getState().messages).toHaveLength(2)
    })
  })

  describe('setScrollToMessageId', () => {
    it('sets target and increments nonce', () => {
      const before = useThreadStore.getState().scrollRequestNonce
      useThreadStore.getState().setScrollToMessageId('msg-99')
      expect(useThreadStore.getState().scrollToMessageId).toBe('msg-99')
      expect(useThreadStore.getState().scrollRequestNonce).toBe(before + 1)
    })

    it('does not increment nonce when clearing', () => {
      useThreadStore.getState().setScrollToMessageId('msg-1')
      const nonce = useThreadStore.getState().scrollRequestNonce
      useThreadStore.getState().setScrollToMessageId(null)
      expect(useThreadStore.getState().scrollRequestNonce).toBe(nonce)
    })
  })
})
