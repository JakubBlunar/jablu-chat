import type { Message } from '@chat/shared'
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'

export interface MessageStoreData {
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  hasNewer: boolean
  scrollToMessageId: string | null
  scrollRequestNonce: number
  fetchMessages: (id: string, cursor?: string) => Promise<void>
  fetchMessagesAround: (id: string, messageId: string) => Promise<void>
  fetchNewerMessages?: (id: string) => Promise<void>
  clearMessages: () => void
  setScrollToMessageId: (id: string | null) => void
  getLoadedForId: () => string | null
}

const EMPTY: Message[] = []
const NOOP_FETCH = async () => {}
const NOOP_CLEAR = () => {}

export function useMessageStoreAdapter(mode: 'channel' | 'dm'): MessageStoreData {
  const isDm = mode === 'dm'

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

  if (isDm && dm) {
    return {
      messages: dm.messages,
      isLoading: dm.isLoading,
      hasMore: dm.hasMore,
      hasNewer: dm.hasNewer,
      scrollToMessageId: dm.scrollToMessageId,
      scrollRequestNonce: dm.scrollRequestNonce,
      fetchMessages: dm.fetchMessages,
      fetchMessagesAround: dm.fetchMessagesAround,
      fetchNewerMessages: dm.fetchNewerMessages,
      clearMessages: dm.clearMessages,
      setScrollToMessageId,
      getLoadedForId
    }
  }

  if (ch) {
    return {
      messages: ch.messages,
      isLoading: ch.isLoading,
      hasMore: ch.hasMore,
      hasNewer: ch.hasNewer,
      scrollToMessageId: ch.scrollToMessageId,
      scrollRequestNonce: ch.scrollRequestNonce,
      fetchMessages: ch.fetchMessages,
      fetchMessagesAround: ch.fetchMessagesAround,
      fetchNewerMessages: ch.fetchNewerMessages,
      clearMessages: ch.clearMessages,
      setScrollToMessageId,
      getLoadedForId
    }
  }

  return {
    messages: EMPTY,
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    scrollToMessageId: null,
    scrollRequestNonce: 0,
    fetchMessages: NOOP_FETCH,
    fetchMessagesAround: NOOP_FETCH,
    clearMessages: NOOP_CLEAR,
    setScrollToMessageId,
    getLoadedForId
  }
}
