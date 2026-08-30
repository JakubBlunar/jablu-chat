import type { Message } from '@chat/shared'
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ScrollStoreAdapter } from '@/components/chat/hooks/useMessageScroll'
import { getSocket } from '@/lib/socket'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useReadStateStore } from '@/stores/readState.store'

export type { ScrollStoreAdapter as MessageStoreData } from '@/components/chat/hooks/useMessageScroll'

const EMPTY: Message[] = []
const NOOP_FETCH = async () => {}
const NOOP_CLEAR = () => {}

export function useMessageStoreAdapter(
  mode: 'channel' | 'dm',
  contextId: string | null
): ScrollStoreAdapter {
  const isDm = mode === 'dm'

  // Anchor used by useMessageScroll to land on the first unread message
  // instead of snapping to bottom. Prefer the session snapshot (taken on
  // open and preserved across the in-channel ack); fall back to live read
  // state for the initial paint before useChannelAck captures the snapshot.
  const initialAnchorMessageId = useReadStateStore((s) => {
    if (!contextId) return null
    const snap = isDm ? s.dmViewSnapshots.get(contextId) : s.channelViewSnapshots.get(contextId)
    if (snap) return snap.firstUnreadMessageId
    const live = isDm ? s.dms.get(contextId) : s.channels.get(contextId)
    if (!live || live.unreadCount === 0) return null
    return live.firstUnreadMessageId ?? null
  })

  const ch = useMessageStore(
    useShallow((s) =>
      isDm
        ? null
        : {
            messages: s.messages,
            isLoading: s.isLoading,
            hasMore: s.hasMore,
            hasNewer: s.hasNewer,
            scrollToMessageId: s.scrollToMessageId,
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
            messages: s.messages,
            isLoading: s.isLoading,
            hasMore: s.hasMore,
            hasNewer: s.hasNewer,
            scrollToMessageId: s.scrollToMessageId,
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
    return { messages: s.messages, isLoading: s.isLoading, hasMore: s.hasMore, hasNewer: s.hasNewer }
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
      const loadedFor = isDm
        ? useDmStore.getState().loadedForConvId
        : useMessageStore.getState().loadedForChannelId
      if (loadedFor === contextId) store.stashCurrent()
    },
    [isDm]
  )

  const src = isDm ? dm : ch

  if (src) {
    return {
      messages: src.messages,
      isLoading: src.isLoading,
      hasMore: src.hasMore,
      hasNewer: src.hasNewer,
      scrollToMessageId: src.scrollToMessageId,
      scrollRequestNonce: src.scrollRequestNonce,
      initialAnchorMessageId,
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
    initialAnchorMessageId,
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
