import type { Message } from '@chat/shared'
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ScrollStoreAdapter } from '@/components/chat/hooks/useMessageScroll'
import { getSocket } from '@/lib/socket'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { openConversation } from '@/lib/conversationNavigation'
import { useServerStore } from '@/stores/server.store'

export type { ScrollStoreAdapter as MessageStoreData } from '@/components/chat/hooks/useMessageScroll'

const EMPTY: Message[] = []
const NOOP_FETCH = async () => {}
const NOOP_CLEAR = () => {}

export function useMessageStoreAdapter(mode: 'channel' | 'dm', contextId: string | null): ScrollStoreAdapter {
  const isDm = mode === 'dm'
  const deferInitialLoad = useNavigationStore((s) => s.isNavigating)

  const ch = useMessageStore(
    useShallow((s) =>
      isDm
        ? null
        : {
            messages: s.loadedForChannelId === contextId ? s.messages : EMPTY,
            isLoading: s.isLoading,
            hasMore: s.hasMore,
            hasNewer: s.hasNewer,
            scrollToMessageId: s.loadedForChannelId === contextId ? s.scrollToMessageId : null,
            scrollRequestNonce: s.scrollRequestNonce,
            fetchMessages: s.fetchMessages,
            fetchMessagesAround: s.fetchMessagesAround,
            fetchNewerMessages: s.fetchNewerMessages,
            clearMessages: s.clearMessages
          }
    )
  )

  const dm = useDmStore(
    useShallow((s) =>
      isDm
        ? {
            messages: s.loadedForConvId === contextId ? s.messages : EMPTY,
            isLoading: s.isLoading,
            hasMore: s.hasMore,
            hasNewer: s.hasNewer,
            scrollToMessageId: s.loadedForConvId === contextId ? s.scrollToMessageId : null,
            scrollRequestNonce: s.scrollRequestNonce,
            fetchMessages: s.fetchMessages,
            fetchMessagesAround: s.fetchMessagesAround,
            fetchNewerMessages: s.fetchNewerMessages,
            clearMessages: s.clearMessages
          }
        : null
    )
  )

  const setScrollToMessageId = useCallback(
    (id: string | null) => {
      if (isDm) {
        useDmStore.getState().setScrollToMessageId(id)
      } else {
        useMessageStore.getState().setScrollToMessageId(id)
      }
    },
    [isDm]
  )

  const getLoadedForId = useCallback(() => {
    if (isDm) {
      return useDmStore.getState().loadedForConvId
    }
    return useMessageStore.getState().loadedForChannelId
  }, [isDm])

  const getSnapshot = useCallback(() => {
    const s = isDm ? useDmStore.getState() : useMessageStore.getState()
    return {
      messages: s.messages,
      isLoading: s.isLoading,
      hasMore: s.hasMore,
      hasNewer: s.hasNewer,
      error: s.messagesError
    }
  }, [isDm])

  const onContextJoin = useCallback(
    (contextId: string) => {
      const socket = getSocket()
      if (isDm) {
        if (socket?.connected) socket.emit('dm:join', { conversationId: contextId })
      } else {
        socket?.emit('channel:join', { channelId: contextId })
      }
    },
    [isDm]
  )

  /**
   * Fires on every context switch, including URL-driven ones that never go
   * through navigation.store, so this is where the outgoing context is handed
   * to the cache.
   *
   * It deliberately does not emit `channel:leave`: the gateway subscribes the
   * socket to every visible channel on connect, and leaving would stop the
   * events that keep the cached copy correct.
   */
  const onContextLeave = useCallback(
    (contextId: string) => {
      const store = isDm ? useDmStore.getState() : useMessageStore.getState()
      const loadedFor = isDm ? useDmStore.getState().loadedForConvId : useMessageStore.getState().loadedForChannelId
      if (loadedFor === contextId) store.stashCurrent()
    },
    [isDm]
  )

  const src = isDm ? dm : ch

  if (src) {
    return {
      messages: src.messages,
      isLoading: src.isLoading || deferInitialLoad,
      hasMore: src.hasMore,
      hasNewer: src.hasNewer,
      scrollToMessageId: src.scrollToMessageId,
      scrollRequestNonce: src.scrollRequestNonce,
      deferInitialLoad,
      requestJump: (messageId) => {
        if (!contextId) return
        const serverId = useServerStore.getState().currentServerId
        if (!isDm && !serverId) return
        void openConversation({
          target: isDm
            ? { kind: 'dm', conversationId: contextId }
            : { kind: 'channel', serverId: serverId!, channelId: contextId },
          position: { kind: 'message', messageId },
          source: 'reply'
        })
      },
      requestLatest: () => {
        if (!contextId) return
        const serverId = useServerStore.getState().currentServerId
        if (!isDm && !serverId) return
        void openConversation({
          target: isDm
            ? { kind: 'dm', conversationId: contextId }
            : { kind: 'channel', serverId: serverId!, channelId: contextId },
          position: { kind: 'latest' }
        })
      },
      fetchMessages: src.fetchMessages,
      fetchMessagesAround: src.fetchMessagesAround,
      fetchNewerMessages: src.fetchNewerMessages,
      clearMessages: src.clearMessages,
      setScrollToMessageId,
      getLoadedForId,
      getSnapshot,
      onContextJoin,
      onContextLeave
    }
  }

  return {
    messages: EMPTY,
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    scrollToMessageId: null,
    scrollRequestNonce: 0,
    requestJump: NOOP_CLEAR,
    requestLatest: NOOP_CLEAR,
    fetchMessages: NOOP_FETCH,
    fetchMessagesAround: NOOP_FETCH,
    clearMessages: NOOP_CLEAR,
    setScrollToMessageId,
    getLoadedForId,
    getSnapshot,
    onContextJoin,
    onContextLeave
  }
}
