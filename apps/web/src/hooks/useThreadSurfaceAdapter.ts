import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ScrollStoreAdapter } from '@/components/chat/hooks/useMessageScroll'
import { useThreadStore } from '@/stores/thread.store'

export function useThreadSurfaceAdapter(): ScrollStoreAdapter {
  const {
    messages,
    isLoading,
    hasMore,
    hasNewer,
    scrollToMessageId,
    scrollRequestNonce
  } = useThreadStore(
    useShallow((s) => ({
      messages: s.messages,
      isLoading: s.isLoading,
      hasMore: s.hasMore,
      hasNewer: s.hasNewer,
      scrollToMessageId: s.scrollToMessageId,
      scrollRequestNonce: s.scrollRequestNonce
    }))
  )

  const fetchMessages = useCallback(async (_id: string, cursor?: string) => {
    if (cursor) {
      await useThreadStore.getState().fetchMore()
    } else {
      await useThreadStore.getState().fetchMessages()
    }
  }, [])

  const fetchMessagesAround = useCallback(async (_id: string, messageId: string) => {
    const state = useThreadStore.getState()
    if (state.parentMessage && state.channelId) {
      state.openThread(state.channelId, state.parentMessage, { focusMessageId: messageId })
    }
  }, [])

  const fetchNewerMessages = useCallback(async (_id: string) => {
    await useThreadStore.getState().fetchNewer()
  }, [])

  const clearMessages = useCallback(() => {
    useThreadStore.setState({ messages: [], hasMore: false, hasNewer: false })
  }, [])

  const setScrollToMessageId = useCallback((id: string | null) => {
    useThreadStore.getState().setScrollToMessageId(id)
  }, [])

  const getLoadedForId = useCallback(() => {
    return useThreadStore.getState().loadedForParentId
  }, [])

  const getSnapshot = useCallback(() => {
    const s = useThreadStore.getState()
    return { messages: s.messages, isLoading: s.isLoading, hasMore: s.hasMore, hasNewer: s.hasNewer }
  }, [])

  return {
    messages,
    isLoading,
    hasMore,
    hasNewer,
    scrollToMessageId,
    scrollRequestNonce,
    fetchMessages,
    fetchMessagesAround,
    fetchNewerMessages,
    clearMessages,
    setScrollToMessageId,
    getLoadedForId,
    getSnapshot
  }
}
