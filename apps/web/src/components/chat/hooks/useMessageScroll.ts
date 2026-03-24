import type { Message } from "@chat/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { getSocket } from "@/lib/socket";
import { useDmStore } from "@/stores/dm.store";
import { useMessageStore } from "@/stores/message.store";

const VIRTUAL_START = 100_000;

export { VIRTUAL_START };

interface StoreAdapter {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  hasNewer: boolean;
  scrollToMessageId: string | null;
  scrollRequestNonce: number;
  fetchMessages: (id: string, before?: string) => Promise<void>;
  fetchMessagesAround: (id: string, messageId: string) => Promise<void>;
  fetchNewerMessages?: (id: string) => Promise<void>;
  clearMessages: () => void;
  setScrollToMessageId: (id: string | null) => void;
  getLoadedForId: () => string | null;
}

export function useMessageScroll(
  mode: "channel" | "dm",
  contextId: string | null,
  store: StoreAdapter,
) {
  const isDm = mode === "dm";
  const {
    messages, hasMore, hasNewer, scrollToMessageId,
    scrollRequestNonce, fetchMessages, fetchMessagesAround,
    fetchNewerMessages, clearMessages, setScrollToMessageId, getLoadedForId,
  } = store;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  const scrollParentRef = useCallback((node: HTMLElement | null) => {
    setScrollParent(node);
  }, []);
  const [atBottom, setAtBottom] = useState(true);
  const handleAtBottomChange = useCallback((bottom: boolean) => {
    if (scrollParent && scrollParent.scrollHeight <= scrollParent.clientHeight + 10) {
      setAtBottom(true);
      return;
    }
    setAtBottom(bottom);
  }, [scrollParent]);
  const [firstItemIndex, setFirstItemIndex] = useState(VIRTUAL_START);
  const [virtuosoKey, setVirtuosoKey] = useState(0);

  const hasNewerRef = useRef(hasNewer);
  hasNewerRef.current = hasNewer;

  const followOutput = useCallback((isAtBottom: boolean) => {
    if (hasNewerRef.current) return false;
    return isAtBottom ? ("smooth" as const) : false;
  }, []);

  /* ── Scroll-to-message (polling-based) ── */
  const scrollTargetIndexRef = useRef<number | null>(null);
  const scrollParentNodeRef = useRef<HTMLElement | null>(null);
  scrollParentNodeRef.current = scrollParent;

  useEffect(() => {
    if (!scrollToMessageId || !contextId) {
      scrollTargetIndexRef.current = null;
      return;
    }

    const targetId = scrollToMessageId;
    let pollCancelled = false;
    let fetchAttempted = false;
    const startTime = Date.now();
    const TIMEOUT = 8000;

    const getStore = () =>
      isDm ? useDmStore.getState() : useMessageStore.getState();

    const poll = () => {
      if (pollCancelled) return;
      if (Date.now() - startTime > TIMEOUT) {
        setScrollToMessageId(null);
        return;
      }

      const sp = scrollParentNodeRef.current;
      const state = getStore();
      const loadedId = isDm
        ? (state as ReturnType<typeof useDmStore.getState>).loadedForConvId
        : (state as ReturnType<typeof useMessageStore.getState>).loadedForChannelId;

      if (!sp || state.isLoading || state.messages.length === 0 || loadedId !== contextId) {
        setTimeout(poll, 60);
        return;
      }

      const idx = state.messages.findIndex((m) => m.id === targetId);
      if (idx < 0) {
        if (!fetchAttempted) {
          fetchAttempted = true;
          clearMessages();
          setFirstItemIndex(VIRTUAL_START);
          void fetchMessagesAround(contextId, targetId);
          setTimeout(poll, 200);
        } else {
          setScrollToMessageId(null);
        }
        return;
      }

      pollCancelled = true;
      scrollTargetIndexRef.current = idx;
      setScrollToMessageId(null);
      setFirstItemIndex(VIRTUAL_START);
      setAtBottom(false);
      sp.scrollTop = 0;
      setVirtuosoKey((k) => k + 1);

      const tryHighlight = (attempts = 0) => {
        const currentSp = scrollParentNodeRef.current;
        const el = document.getElementById(`msg-${targetId}`);
        if (el && currentSp) {
          const elRect = el.getBoundingClientRect();
          const spRect = currentSp.getBoundingClientRect();
          const offset = elRect.top - spRect.top + currentSp.scrollTop;
          currentSp.scrollTo({ top: offset - currentSp.clientHeight / 2 + elRect.height / 2, behavior: "auto" });
          el.classList.add("bg-primary/10");
          setTimeout(() => el.classList.remove("bg-primary/10"), 3000);
        } else if (attempts < 40) {
          setTimeout(() => tryHighlight(attempts + 1), 50);
        }
      };
      setTimeout(() => tryHighlight(), 200);
    };

    const timer = setTimeout(poll, 30);
    return () => {
      pollCancelled = true;
      clearTimeout(timer);
    };
  }, [scrollToMessageId, scrollRequestNonce, contextId, isDm, clearMessages, fetchMessagesAround, setScrollToMessageId]);

  /* ── Context switch ── */
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const prev = prevIdRef.current;

    if (prev && prev !== contextId) {
      if (!isDm) socket?.emit("channel:leave", { channelId: prev });
    }

    if (contextId) {
      const alreadyLoaded = getLoadedForId() === contextId;

      if (!alreadyLoaded) {
        if (isDm) {
          if (socket?.connected) socket.emit("dm:join", { conversationId: contextId });
        } else {
          socket?.emit("channel:join", { channelId: contextId });
        }
      }
      prevIdRef.current = contextId;

      if (alreadyLoaded) {
        setFirstItemIndex(VIRTUAL_START);
        setAtBottom(true);
      } else {
        setFirstItemIndex(VIRTUAL_START);
        setAtBottom(true);
        clearMessages();
        void fetchMessages(contextId);
      }
    } else {
      prevIdRef.current = null;
    }

    return () => {
      if (!isDm && contextId) {
        getSocket()?.emit("channel:leave", { channelId: contextId });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, clearMessages, fetchMessages, isDm, getLoadedForId]);

  /* ── Pagination ── */
  const loadingRef = useRef(false);
  const startReached = useCallback(async () => {
    if (!contextId || !messages.length || loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    const prevLen = messages.length;
    await fetchMessages(contextId, messages[0].id);
    const currentStore = isDm ? useDmStore.getState() : useMessageStore.getState();
    const newLen = currentStore.messages.length;
    const prepended = newLen - prevLen;
    if (prepended > 0) {
      setFirstItemIndex((prev) => prev - prepended);
    }
    loadingRef.current = false;
  }, [contextId, messages, hasMore, fetchMessages, isDm]);

  const loadingNewerRef = useRef(false);
  const endReached = useCallback(async () => {
    if (!contextId || !messages.length || loadingNewerRef.current || !hasNewer || !fetchNewerMessages) return;
    loadingNewerRef.current = true;
    await fetchNewerMessages(contextId);
    loadingNewerRef.current = false;
  }, [contextId, messages, hasNewer, fetchNewerMessages]);

  const stickToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
  }, []);

  const handleBottomButtonClick = useCallback(() => {
    if (hasNewer && contextId) {
      clearMessages();
      setFirstItemIndex(VIRTUAL_START);
      void fetchMessages(contextId);
    } else {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
    }
  }, [hasNewer, contextId, clearMessages, fetchMessages]);

  /* ── Jump to message (from pinned panel) ── */
  const jumpTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of jumpTimersRef.current) clearTimeout(t);
      jumpTimersRef.current = [];
    };
  }, []);

  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      for (const t of jumpTimersRef.current) clearTimeout(t);
      jumpTimersRef.current = [];

      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx >= 0) {
        const absIndex = firstItemIndex + idx;
        const tryFind = (attempts = 0) => {
          const el = document.getElementById(`msg-${messageId}`);
          if (el && scrollParent) {
            const cRect = scrollParent.getBoundingClientRect();
            const eRect = el.getBoundingClientRect();
            scrollParent.scrollTop += eRect.top - cRect.top - cRect.height / 2 + eRect.height / 2;
            el.classList.add("bg-primary/10");
            jumpTimersRef.current.push(
              setTimeout(() => el.classList.remove("bg-primary/10"), 2000),
            );
          } else if (attempts < 20) {
            virtuosoRef.current?.scrollToIndex({ index: absIndex, align: "center" });
            jumpTimersRef.current.push(
              setTimeout(() => tryFind(attempts + 1), 100),
            );
          }
        };
        virtuosoRef.current?.scrollToIndex({ index: absIndex, align: "center" });
        requestAnimationFrame(() => tryFind());
      }
    },
    [messages, firstItemIndex, scrollParent],
  );

  return {
    virtuosoRef,
    scrollParentRef,
    scrollParent,
    atBottom,
    firstItemIndex,
    virtuosoKey,
    followOutput,
    handleAtBottomChange,
    scrollTargetIndexRef,
    startReached,
    endReached,
    stickToBottom,
    handleBottomButtonClick,
    handleJumpToMessage,
  };
}
