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

const EMPTY: Message[] = [];
const NOOP_FETCH = async () => {};
const NOOP_CLEAR = () => {};

export function useMessageStoreAdapter(mode: "channel" | "dm"): MessageStoreData {
  const isDm = mode === "dm";

  const chMessages = useMessageStore((s) => isDm ? EMPTY : s.messages);
  const chIsLoading = useMessageStore((s) => isDm ? false : s.isLoading);
  const chHasMore = useMessageStore((s) => isDm ? false : s.hasMore);
  const chHasNewer = useMessageStore((s) => isDm ? false : s.hasNewer);
  const chScrollTo = useMessageStore((s) => isDm ? null : s.scrollToMessageId);
  const chScrollNonce = useMessageStore((s) => isDm ? 0 : s.scrollRequestNonce);
  const chFetch = useMessageStore((s) => isDm ? NOOP_FETCH : s.fetchMessages);
  const chFetchAround = useMessageStore((s) => isDm ? NOOP_FETCH : s.fetchMessagesAround);
  const chFetchNewer = useMessageStore((s) => isDm ? NOOP_FETCH : s.fetchNewerMessages);
  const chClear = useMessageStore((s) => isDm ? NOOP_CLEAR : s.clearMessages);

  const dmMessages = useDmStore((s) => isDm ? s.messages : EMPTY);
  const dmIsLoading = useDmStore((s) => isDm ? s.isLoading : false);
  const dmHasMore = useDmStore((s) => isDm ? s.hasMore : false);
  const dmHasNewer = useDmStore((s) => isDm ? s.hasNewer : false);
  const dmScrollTo = useDmStore((s) => isDm ? s.scrollToMessageId : null);
  const dmScrollNonce = useDmStore((s) => isDm ? s.scrollRequestNonce : 0);
  const dmFetch = useDmStore((s) => isDm ? s.fetchMessages : NOOP_FETCH);
  const dmFetchAround = useDmStore((s) => isDm ? s.fetchMessagesAround : NOOP_FETCH);
  const dmClear = useDmStore((s) => isDm ? s.clearMessages : NOOP_CLEAR);

  const setScrollToMessageId = useCallback(
    (id: string | null) => {
      if (isDm) {
        useDmStore.getState().setScrollToMessageId(id);
      } else {
        useMessageStore.getState().setScrollToMessageId(id);
      }
    },
    [isDm],
  );

  const getLoadedForId = useCallback(
    () => {
      if (isDm) {
        return useDmStore.getState().loadedForConvId;
      }
      return useMessageStore.getState().loadedForChannelId;
    },
    [isDm],
  );

  if (isDm) {
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
