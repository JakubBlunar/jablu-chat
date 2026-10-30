import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ScrollStoreAdapter } from '@/components/chat/hooks/useMessageScroll'
import { useThreadStore } from '@/stores/thread.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useServerStore } from '@/stores/server.store'
import { openConversation } from '@/lib/conversationNavigation'

export function useThreadSurfaceAdapter(): ScrollStoreAdapter {
  const deferInitialLoad = useNavigationStore((state) => state.isNavigating)
  const { messages, isLoading, hasMore, hasNewer, scrollToMessageId, scrollRequestNonce } = useThreadStore(
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
      useThreadStore.setState({ focusMessageId: null })
      await useThreadStore.getState().fetchMessages()
    }
  }, [])

  const fetchMessagesAround = useCallback(async (_id: string, messageId: string) => {
    const state = useThreadStore.getState()
    if (state.parentMessage && state.channelId) {
      useThreadStore.setState({ focusMessageId: messageId })
      await useThreadStore.getState().fetchMessages()
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
    return {
      messages: s.messages,
      isLoading: s.isLoading,
      hasMore: s.hasMore,
      hasNewer: s.hasNewer,
      error: s.messagesError
    }
  }, [])

  return {
    deferInitialLoad,
    requestJump: (messageId) => {
      const { channelId, parentMessage } = useThreadStore.getState()
      const serverId = useServerStore.getState().currentServerId
      if (serverId && channelId && parentMessage)
        void openConversation({
          target: { kind: 'channel', serverId, channelId },
          position: { kind: 'message', messageId, threadParentId: parentMessage.id },
          source: 'reply'
        })
    },
    requestLatest: () => {
      const { channelId, parentMessage } = useThreadStore.getState()
      const serverId = useServerStore.getState().currentServerId
      if (serverId && channelId && parentMessage)
        void openConversation({
          target: { kind: 'channel', serverId, channelId },
          position: { kind: 'latest', threadParentId: parentMessage.id }
        })
    },
    messages,
    isLoading: isLoading || deferInitialLoad,
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
