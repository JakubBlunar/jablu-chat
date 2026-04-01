import { renderHook, act } from '@testing-library/react'
import { useForumSurfaceAdapter } from './useForumSurfaceAdapter'
import { useForumReplyStore } from '@/stores/forumReply.store'
import { makeMessages, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: { getThreadMessages: jest.fn() }
}))

import { api } from '@/lib/api'
const mockApi = jest.mocked(api.getThreadMessages)

function resetStore() {
  useForumReplyStore.setState({
    channelId: null, postId: null, messages: [], isLoading: false,
    hasMore: false, hasNewer: false, focusMessageId: null,
    scrollToMessageId: null, scrollRequestNonce: 0, loadedForPostId: null
  })
}

beforeEach(() => {
  resetStore()
  resetMsgSeq()
  jest.clearAllMocks()
})

describe('useForumSurfaceAdapter', () => {
  it('returns empty initial state', () => {
    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.hasMore).toBe(false)
    expect(result.current.hasNewer).toBe(false)
  })

  it('reflects store updates reactively', () => {
    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    const msgs = makeMessages(3)

    act(() => {
      useForumReplyStore.setState({ messages: msgs, isLoading: false, hasMore: true })
    })

    expect(result.current.messages).toHaveLength(3)
    expect(result.current.hasMore).toBe(true)
  })

  it('fetchMessages sets channelId/postId and fetches', async () => {
    const msgs = makeMessages(2)
    mockApi.mockResolvedValueOnce({ messages: msgs, hasMore: false })

    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    await act(() => result.current.fetchMessages('post-1'))

    const store = useForumReplyStore.getState()
    expect(store.channelId).toBe('ch-1')
    expect(store.postId).toBe('post-1')
    expect(store.messages).toHaveLength(2)
  })

  it('fetchMessages with cursor calls fetchOlder', async () => {
    const existing = makeMessages(2)
    useForumReplyStore.setState({
      channelId: 'ch-1', postId: 'post-1', messages: existing
    })
    const older = makeMessages(1)
    mockApi.mockResolvedValueOnce({ messages: older, hasMore: false })

    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    await act(() => result.current.fetchMessages('post-1', existing[0].id))

    expect(useForumReplyStore.getState().messages).toHaveLength(3)
  })

  it('fetchMessagesAround sets focusMessageId and fetches', async () => {
    const msgs = makeMessages(5)
    mockApi.mockResolvedValueOnce({ messages: msgs, hasMore: true, hasNewer: true })

    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    await act(() => result.current.fetchMessagesAround('post-1', 'msg-target'))

    const store = useForumReplyStore.getState()
    expect(store.focusMessageId).toBe('msg-target')
    expect(store.messages).toHaveLength(5)
    expect(store.hasNewer).toBe(true)
  })

  it('returns null channelId early without fetching', async () => {
    const { result } = renderHook(() => useForumSurfaceAdapter(null))
    await act(() => result.current.fetchMessages('post-1'))
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('getLoadedForId returns store loadedForPostId', () => {
    useForumReplyStore.setState({ loadedForPostId: 'post-42' })
    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    expect(result.current.getLoadedForId()).toBe('post-42')
  })

  it('getSnapshot returns current state', () => {
    const msgs = makeMessages(2)
    useForumReplyStore.setState({
      messages: msgs, isLoading: true, hasMore: true, hasNewer: false
    })
    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    const snap = result.current.getSnapshot()
    expect(snap.messages).toHaveLength(2)
    expect(snap.isLoading).toBe(true)
    expect(snap.hasMore).toBe(true)
  })

  it('clearMessages delegates to store', () => {
    useForumReplyStore.setState({ messages: makeMessages(3), hasMore: true })
    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    act(() => result.current.clearMessages())
    expect(useForumReplyStore.getState().messages).toEqual([])
  })

  it('setScrollToMessageId delegates to store', () => {
    const { result } = renderHook(() => useForumSurfaceAdapter('ch-1'))
    act(() => result.current.setScrollToMessageId('msg-77'))
    expect(useForumReplyStore.getState().scrollToMessageId).toBe('msg-77')
  })
})
