import { useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ScrollStoreAdapter } from '@/components/chat/hooks/useMessageScroll'
import { useForumReplyStore } from '@/stores/forumReply.store'

export function useForumSurfaceAdapter(channelId: string | null): ScrollStoreAdapter {
  const {
    messages,
    isLoading,
    hasMore,
    hasNewer,
    scrollToMessageId,
    scrollRequestNonce
  } = useForumReplyStore(
    useShallow((s) => ({
      messages: s.messages,
      isLoading: s.isLoading,
      hasMore: s.hasMore,
      hasNewer: s.hasNewer,
      scrollToMessageId: s.scrollToMessageId,
      scrollRequestNonce: s.scrollRequestNonce
    }))
  )

  const channelIdRef = useRef(channelId)
  channelIdRef.current = channelId

  const fetchMessages = useCallback(async (postId: string, cursor?: string) => {
    const chId = channelIdRef.current
    if (!chId) return
    if (cursor) {
      await useForumReplyStore.getState().fetchOlder()
    } else {
      useForumReplyStore.setState({ channelId: chId, postId, focusMessageId: null })
      await useForumReplyStore.getState().fetchMessages()
    }
  }, [])

  const fetchMessagesAround = useCallback(async (postId: string, messageId: string) => {
    const chId = channelIdRef.current
    if (!chId) return
    useForumReplyStore.setState({
      channelId: chId,
      postId,
      focusMessageId: messageId,
      messages: [],
      isLoading: true,
      hasMore: false,
      hasNewer: false,
      loadedForPostId: null
    })
    await useForumReplyStore.getState().fetchMessages()
  }, [])

  const fetchNewerMessages = useCallback(async (_postId: string) => {
    await useForumReplyStore.getState().fetchNewer()
  }, [])

  const clearMessages = useCallback(() => {
    useForumReplyStore.getState().clearMessages()
  }, [])

  const setScrollToMessageId = useCallback((id: string | null) => {
    useForumReplyStore.getState().setScrollToMessageId(id)
  }, [])

  const getLoadedForId = useCallback(() => {
    return useForumReplyStore.getState().loadedForPostId
  }, [])

  const getSnapshot = useCallback(() => {
    const s = useForumReplyStore.getState()
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
