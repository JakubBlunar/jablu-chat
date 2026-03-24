import type { Message } from "@chat/shared";
import { useCallback } from "react";
import { useDmStore } from "@/stores/dm.store";
import { useMessageStore } from "@/stores/message.store";

export interface MessageStoreData {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  hasNewer: boolean;
  scrollToMessageId: string | null;
  scrollRequestNonce: number;
  fetchMessages: (id: string, cursor?: string) => Promise<void>;
  fetchMessagesAround: (id: string, messageId: string) => Promise<void>;
  fetchNewerMessages?: (id: string) => Promise<void>;
  clearMessages: () => void;
  setScrollToMessageId: (id: string | null) => void;
  getLoadedForId: () => string | null;
}

export function useMessageStoreAdapter(mode: "channel" | "dm"): MessageStoreData {
  const chMessages = useMessageStore((s) => s.messages);
  const chIsLoading = useMessageStore((s) => s.isLoading);
  const chHasMore = useMessageStore((s) => s.hasMore);
  const chHasNewer = useMessageStore((s) => s.hasNewer);
  const chScrollTo = useMessageStore((s) => s.scrollToMessageId);
  const chScrollNonce = useMessageStore((s) => s.scrollRequestNonce);
  const chFetch = useMessageStore((s) => s.fetchMessages);
  const chFetchAround = useMessageStore((s) => s.fetchMessagesAround);
  const chFetchNewer = useMessageStore((s) => s.fetchNewerMessages);
  const chClear = useMessageStore((s) => s.clearMessages);

  const dmMessages = useDmStore((s) => s.messages);
  const dmIsLoading = useDmStore((s) => s.isLoading);
  const dmHasMore = useDmStore((s) => s.hasMore);
  const dmHasNewer = useDmStore((s) => s.hasNewer);
  const dmScrollTo = useDmStore((s) => s.scrollToMessageId);
  const dmScrollNonce = useDmStore((s) => s.scrollRequestNonce);
  const dmFetch = useDmStore((s) => s.fetchMessages);
  const dmFetchAround = useDmStore((s) => s.fetchMessagesAround);
  const dmClear = useDmStore((s) => s.clearMessages);

  const setScrollToMessageId = useCallback(
    (id: string | null) => {
      if (mode === "dm") {
        useDmStore.getState().setScrollToMessageId(id);
      } else {
        useMessageStore.getState().setScrollToMessageId(id);
      }
    },
    [mode],
  );

  const getLoadedForId = useCallback(
    () => {
      if (mode === "dm") {
        return useDmStore.getState().loadedForConvId;
      }
      return useMessageStore.getState().loadedForChannelId;
    },
    [mode],
  );

  if (mode === "dm") {
    return {
      messages: dmMessages,
      isLoading: dmIsLoading,
      hasMore: dmHasMore,
      hasNewer: dmHasNewer,
      scrollToMessageId: dmScrollTo,
      scrollRequestNonce: dmScrollNonce,
      fetchMessages: dmFetch,
      fetchMessagesAround: dmFetchAround,
      clearMessages: dmClear,
      setScrollToMessageId,
      getLoadedForId,
    };
  }

  return {
    messages: chMessages,
    isLoading: chIsLoading,
    hasMore: chHasMore,
    hasNewer: chHasNewer,
    scrollToMessageId: chScrollTo,
    scrollRequestNonce: chScrollNonce,
    fetchMessages: chFetch,
    fetchMessagesAround: chFetchAround,
    fetchNewerMessages: chFetchNewer,
    clearMessages: chClear,
    setScrollToMessageId,
    getLoadedForId,
  };
}
