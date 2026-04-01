import { renderHook, act } from '@testing-library/react'
import { useThreadSurfaceAdapter } from './useThreadSurfaceAdapter'
import { useThreadStore } from '@/stores/thread.store'
import { makeMessage, makeMessages, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: { getThreadMessages: jest.fn() }
}))

import { api } from '@/lib/api'
const mockApi = jest.mocked(api.getThreadMessages)

const parentMsg = makeMessage({ id: 'parent-1' })

function resetStore() {
  useThreadStore.setState({
    isOpen: false, parentMessage: null, channelId: null, messages: [],
    isLoading: false, hasMore: false, hasNewer: false, focusMessageId: null,
    scrollToMessageId: null, scrollRequestNonce: 0, loadedForParentId: null
  })
}

beforeEach(() => {
  resetStore()
  resetMsgSeq()
  jest.clearAllMocks()
})

describe('useThreadSurfaceAdapter', () => {
  it('returns empty initial state', () => {
    const { result } = renderHook(() => useThreadSurfaceAdapter())
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('reflects thread store updates', () => {
    const { result } = renderHook(() => useThreadSurfaceAdapter())
    const msgs = makeMessages(4)
    act(() => {
      useThreadStore.setState({ messages: msgs, hasMore: true })
    })
    expect(result.current.messages).toHaveLength(4)
    expect(result.current.hasMore).toBe(true)
  })

  it('fetchMessages without cursor calls store fetchMessages', async () => {
    const msgs = makeMessages(3)
    mockApi.mockResolvedValueOnce({ messages: msgs, hasMore: false })

    useThreadStore.getState().openThread('ch-1', parentMsg)
    const { result } = renderHook(() => useThreadSurfaceAdapter())

    await act(() => result.current.fetchMessages('parent-1'))
    expect(mockApi).toHaveBeenCalledWith('ch-1', 'parent-1', undefined)
    expect(useThreadStore.getState().messages).toHaveLength(3)
  })

  it('fetchMessages with cursor calls fetchMore', async () => {
    const existing = makeMessages(3)
    const older = makeMessages(2)
    mockApi.mockResolvedValueOnce({ messages: older, hasMore: false })

    useThreadStore.getState().openThread('ch-1', parentMsg)
    useThreadStore.setState({ messages: existing, isLoading: false })

    const { result } = renderHook(() => useThreadSurfaceAdapter())
    await act(() => result.current.fetchMessages('parent-1', existing[0].id))
    expect(useThreadStore.getState().messages).toHaveLength(5)
  })

  it('fetchMessagesAround reopens thread with focus', () => {
    useThreadStore.getState().openThread('ch-1', parentMsg)
    useThreadStore.setState({ isLoading: false })
    const nonce = useThreadStore.getState().scrollRequestNonce

    const { result } = renderHook(() => useThreadSurfaceAdapter())
    act(() => { result.current.fetchMessagesAround('parent-1', 'target-msg') })

    const state = useThreadStore.getState()
    expect(state.focusMessageId).toBe('target-msg')
    expect(state.scrollRequestNonce).toBe(nonce + 1)
  })

  it('clearMessages empties thread store messages', () => {
    useThreadStore.setState({ messages: makeMessages(5), hasMore: true, hasNewer: true })
    const { result } = renderHook(() => useThreadSurfaceAdapter())
    act(() => result.current.clearMessages())
    expect(useThreadStore.getState().messages).toEqual([])
    expect(useThreadStore.getState().hasMore).toBe(false)
  })

  it('getLoadedForId returns loadedForParentId', () => {
    useThreadStore.setState({ loadedForParentId: 'parent-99' })
    const { result } = renderHook(() => useThreadSurfaceAdapter())
    expect(result.current.getLoadedForId()).toBe('parent-99')
  })

  it('getSnapshot returns current thread state', () => {
    useThreadStore.setState({
      messages: makeMessages(2), isLoading: true, hasMore: true, hasNewer: false
    })
    const { result } = renderHook(() => useThreadSurfaceAdapter())
    const snap = result.current.getSnapshot()
    expect(snap.messages).toHaveLength(2)
    expect(snap.isLoading).toBe(true)
  })
})
