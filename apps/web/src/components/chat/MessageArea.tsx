import type { Message, UserStatus } from "@chat/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimpleBar from "simplebar-react";
import { type MentionChannel } from "@/components/chat/ChatInputBar";
import { DelayedRender } from "@/components/DelayedRender";
import { ScrollToBottomButton } from "@/components/ScrollToBottomButton";
import { type ChannelRef } from "@/components/MarkdownContent";
import { ProfileCard, type ProfileCardUser } from "@/components/ProfileCard";
import { MessageRow } from "@/components/chat/MessageRow";
import { UnifiedInput } from "@/components/chat/UnifiedInput";
import { PinnedPanel } from "@/components/chat/PinnedPanel";
import { DmProfilePanel, UserProfileIcon } from "@/components/dm/DmProfilePanel";
import { useMessageStoreAdapter } from "@/hooks/useMessageStoreAdapter";
import { api } from "@/lib/api";
import { formatDateSeparator, isDifferentDay } from "@/lib/format-time";
import { getSocket } from "@/lib/socket";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useLayoutStore } from "@/stores/layout.store";
import { useMemberStore } from "@/stores/member.store";
import { useMessageStore } from "@/stores/message.store";
import { useServerStore } from "@/stores/server.store";
import { useDmStore } from "@/stores/dm.store";
import { useShallow } from "zustand/react/shallow";
import { useAppNavigate } from "@/hooks/useAppNavigate";

/* ────────────────────────────────────────────
   Small icons
   ──────────────────────────────────────────── */

function HashChannelIcon() {
  return (
    <svg className="h-6 w-6 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  );
}

function MembersToggleIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  );
}

function ChannelSettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  );
}

function PinHeaderIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v8m0 0-3-3m3 3 3-3M9 17h6m-6 0v4m6-4v4M5 12h14" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 4.4 19 1 1 0 0 0-.8-1.8A8 8 0 1 1 20 12v1.5a2.5 2.5 0 0 1-5 0V8h-2v.3A5 5 0 1 0 15 17a4.5 4.5 0 0 0 7-3.5V12A10 10 0 0 0 12 2zm0 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  );
}

function ReplyArrowIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="my-2 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] font-semibold text-gray-400">
        {formatDateSeparator(date)}
      </span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

/* ────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────── */

const VIRTUAL_START = 100_000;
const GROUP_GAP_MS = 5 * 60 * 1000;

function isGap(a: Message, b: Message): boolean {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return tb - ta > GROUP_GAP_MS;
}

/* ────────────────────────────────────────────
   Unified MessageArea
   ──────────────────────────────────────────── */

export interface MessageAreaProps {
  mode: "channel" | "dm";
  contextId: string | null;
  memberSidebar?: React.ReactNode;
}

export function MessageArea({ mode, contextId, memberSidebar }: MessageAreaProps) {
  const isDm = mode === "dm";
  const store = useMessageStoreAdapter(mode);
  const {
    messages, isLoading, hasMore, hasNewer, scrollToMessageId,
    scrollRequestNonce, fetchMessages, fetchMessagesAround,
    fetchNewerMessages, clearMessages, setScrollToMessageId, getLoadedForId,
  } = store;

  const userId = useAuthStore((s) => s.user?.id);

  /* ── Virtuoso core state ── */
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

      // tryHighlight runs independently — NOT gated by the effect cleanup
      // because setScrollToMessageId(null) above triggers effect re-run + cleanup
      // before the 200ms timeout fires
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

  /* ── Context switch (channel / conversation change) ── */
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

  /* ── Profile card ── */
  const members = useMemberStore((s) => s.members);
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const [cardUser, setCardUser] = useState<ProfileCardUser | null>(null);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const closeCard = useCallback(() => setCardUser(null), []);

  const membersRef = useRef(members);
  membersRef.current = members;
  const onlineIdsRef = useRef(onlineIds);
  onlineIdsRef.current = onlineIds;

  const dmConversations = useDmStore((s) => s.conversations);
  const dmConvId = useDmStore((s) => s.currentConversationId);
  const currentConv = useMemo(
    () => (isDm ? dmConversations.find((c) => c.id === dmConvId) ?? null : null),
    [isDm, dmConversations, dmConvId],
  );

  const handleUserClick = useCallback(
    (authorId: string, rect: DOMRect) => {
      if (isDm) {
        const convMember = currentConv?.members.find((m) => m.userId === authorId);
        if (!convMember) return;
        setCardUser({
          id: convMember.userId,
          username: convMember.username,
          avatarUrl: convMember.avatarUrl,
          bio: convMember.bio,
          status: (convMember.status as UserStatus) ?? "offline",
          joinedAt: convMember.createdAt,
        });
      } else {
        const member = membersRef.current.find((m) => m.userId === authorId);
        if (!member) return;
        const status: UserStatus = (member.user.status as UserStatus) ??
          (onlineIdsRef.current.has(authorId) ? "online" : "offline");
        setCardUser({
          id: member.userId,
          username: member.user.username,
          displayName: member.user.displayName,
          avatarUrl: member.user.avatarUrl,
          bio: member.user.bio,
          status,
          joinedAt: member.joinedAt,
          role: member.role,
        });
      }
      setCardRect(rect);
    },
    [isDm, currentConv],
  );

  const handleMentionClick = useCallback(
    (username: string, rect: DOMRect) => {
      const member = membersRef.current.find(
        (m) => m.user.username.toLowerCase() === username.toLowerCase(),
      );
      if (!member) return;
      const status: UserStatus = (member.user.status as UserStatus) ??
        (onlineIdsRef.current.has(member.userId) ? "online" : "offline");
      setCardUser({
        id: member.userId,
        username: member.user.username,
        displayName: member.user.displayName,
        avatarUrl: member.user.avatarUrl,
        bio: member.user.bio,
        status,
        joinedAt: member.joinedAt,
        role: member.role,
      });
      setCardRect(rect);
    },
    [],
  );

  /* ── Channel refs for #channel links in markdown ── */
  const allChannels = useChannelStore((s) => s.channels);
  const serverChannelRefs: ChannelRef[] = useMemo(
    () =>
      allChannels
        .filter((c) => c.type === "text")
        .map((c) => ({ id: c.id, serverId: c.serverId, name: c.name })),
    [allChannels],
  );

  const otherMember = useMemo(() => {
    if (!currentConv || currentConv.isGroup) return null;
    return currentConv.members.find((m) => m.userId !== userId) ?? null;
  }, [currentConv, userId]);

  const [mutualServers, setMutualServers] = useState<
    { id: string; name: string; iconUrl: string | null; channels: { id: string; name: string }[] }[]
  >([]);
  useEffect(() => {
    if (!isDm || !otherMember) {
      setMutualServers([]);
      return;
    }
    let cancelled = false;
    api.getMutualServers(otherMember.userId).then((res) => {
      if (!cancelled) setMutualServers(res.servers);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isDm, otherMember?.userId]);

  const dmChannelRefs: ChannelRef[] = useMemo(
    () =>
      mutualServers.flatMap((s) =>
        s.channels.map((c) => ({ id: c.id, serverId: s.id, name: c.name })),
      ),
    [mutualServers],
  );

  const channelRefs = isDm ? dmChannelRefs : serverChannelRefs;

  /* ── DM profile panel toggle ── */
  const [showProfile, setShowProfile] = useState(false);
  const otherName = otherMember?.displayName ?? otherMember?.username ?? "Unknown";

  const { orchestratedGoToChannel } = useAppNavigate();
  const handleChannelClick = useCallback(
    (serverId: string, chId: string) => void orchestratedGoToChannel(serverId, chId),
    [orchestratedGoToChannel],
  );

  /* ── Reply target (unified: local state for both modes) ── */
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    content: string | null;
    authorName: string;
  } | null>(null);

  useEffect(() => {
    setReplyTarget(null);
  }, [contextId]);

  const handleReply = useCallback((msg: Message) => {
    setReplyTarget({
      id: msg.id,
      content: msg.content,
      authorName: msg.author?.displayName ?? msg.author?.username ?? "Deleted User",
    });
  }, []);

  /* ── Typing (channel reads from store, DM from socket) ── */
  const channelTypingNames = useMessageStore(
    useShallow((s) => {
      const out: string[] = [];
      for (const [uid, entry] of s.typingUsers) {
        if (uid !== userId) out.push(entry.username);
      }
      return out.length > 4 ? out.slice(0, 4) : out;
    }),
  );

  const [dmTypingUsers, setDmTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!isDm) return;
    const socket = getSocket();
    if (!socket) return;
    const onTyping = (payload: { conversationId: string; username: string }) => {
      if (payload.conversationId !== contextId) return;
      setDmTypingUsers((prev) =>
        prev.includes(payload.username) ? prev : [...prev, payload.username],
      );
      setTimeout(() => {
        setDmTypingUsers((prev) => prev.filter((u) => u !== payload.username));
      }, 3000);
    };
    socket.on("dm:typing", onTyping);
    return () => { socket.off("dm:typing", onTyping); };
  }, [isDm, contextId]);

  useEffect(() => {
    if (isDm) setDmTypingUsers([]);
  }, [isDm, contextId]);

  const typingNames = isDm ? dmTypingUsers : channelTypingNames;

  /* ── DM read receipts ("Seen") ── */
  const [othersReadMap, setOthersReadMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isDm || !contextId || !currentConv) {
      setOthersReadMap(new Map());
      return;
    }
    api.getDmReadStates(contextId).then((states) => {
      const m = new Map<string, string>();
      for (const s of states) {
        if (s.userId !== userId) m.set(s.userId, s.lastReadAt);
      }
      setOthersReadMap(m);
    }).catch(() => {});
  }, [isDm, contextId, currentConv, userId]);

  useEffect(() => {
    if (!isDm || !contextId) return;
    const socket = getSocket();
    if (!socket) return;
    const onRead = (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
      if (payload.conversationId === contextId && payload.userId !== userId) {
        setOthersReadMap((prev) => {
          const next = new Map(prev);
          next.set(payload.userId, payload.lastReadAt);
          return next;
        });
      }
    };
    socket.on("dm:read", onRead);
    return () => { socket.off("dm:read", onRead); };
  }, [isDm, contextId, userId]);

  /* ── Channel-only: pinned messages panel ── */
  const channelId = isDm ? null : contextId;
  const activeChannel = useChannelStore((s) => {
    if (isDm || !s.currentChannelId) return null;
    const ch = s.channels.find((c) => c.id === s.currentChannelId);
    if (!ch || ch.serverId !== useServerStore.getState().currentServerId) return null;
    return ch;
  });

  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);

  useEffect(() => {
    setPinnedOpen(false);
    setPinnedMessages([]);
  }, [channelId]);

  const handleOpenPinned = useCallback(async () => {
    if (!channelId) return;
    if (pinnedOpen) { setPinnedOpen(false); return; }
    setPinnedOpen(true);
    setPinnedLoading(true);
    try {
      const msgs = await api.getPinnedMessages(channelId);
      setPinnedMessages(msgs);
    } catch {
      setPinnedMessages([]);
    } finally {
      setPinnedLoading(false);
    }
  }, [channelId, pinnedOpen]);

  useEffect(() => {
    if (!pinnedOpen || !channelId) return;
    const socket = getSocket();
    if (!socket) return;
    const onPin = (msg: Message) => {
      if (msg.channelId === channelId) {
        setPinnedMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev],
        );
      }
    };
    const onUnpin = (msg: Message) => {
      if (msg.channelId === channelId) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== msg.id));
      }
    };
    socket.on("message:pin", onPin);
    socket.on("message:unpin", onUnpin);
    return () => {
      socket.off("message:pin", onPin);
      socket.off("message:unpin", onUnpin);
    };
  }, [pinnedOpen, channelId]);

  const [editingChannel, setEditingChannel] = useState(false);
  const myRole = useMemberStore((s) =>
    s.members.find((m) => m.userId === userId),
  )?.role;
  const isAdminOrOwner = myRole === "admin" || myRole === "owner";

  /* ── Channel-only: search ── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  /* ── GIF toggle ── */
  const [gifEnabled, setGifEnabled] = useState(false);
  useEffect(() => {
    api.getGifEnabled().then((r) => setGifEnabled(r.enabled)).catch(() => {});
  }, []);

  const lastOwnMsg = useMemo(() => {
    if (!isDm || othersReadMap.size === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].authorId === userId) return messages[i];
    }
    return null;
  }, [isDm, othersReadMap, messages, userId]);

  const seenByLabel = useMemo(() => {
    if (!lastOwnMsg || !currentConv) return null;
    const names: string[] = [];
    for (const member of currentConv.members) {
      if (member.userId === userId) continue;
      const readAt = othersReadMap.get(member.userId);
      if (readAt && readAt >= lastOwnMsg.createdAt) {
        names.push(member.displayName ?? member.username);
      }
    }
    if (names.length === 0) return null;
    if (!currentConv.isGroup) return "Seen";
    return `Seen by ${names.join(", ")}`;
  }, [lastOwnMsg, currentConv, userId, othersReadMap]);

  /* ── Empty states ── */
  if (!contextId) {
    if (isDm) {
      return (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-surface text-center">
          <p className="text-lg font-semibold text-white">Select a conversation</p>
          <p className="max-w-sm text-sm text-gray-400">
            Choose a DM from the sidebar or click on a user to start chatting.
          </p>
        </div>
      );
    }
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
          <h1 className="text-base font-semibold text-gray-400">Select a channel</h1>
        </header>
        <div className="flex min-h-0 flex-1" />
      </section>
    );
  }

  /* ── Render ── */
  const messageList = (
    <>
      {!isDm && pinnedOpen && channelId && (
        <PinnedPanel
          messages={pinnedMessages}
          loading={pinnedLoading}
          onClose={() => setPinnedOpen(false)}
          isAdminOrOwner={isAdminOrOwner}
          channelId={channelId}
          onJump={handleJumpToMessage}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <SimpleBar
          className="flex h-full flex-col px-4 py-2"
          scrollableNodeProps={{ ref: scrollParentRef }}
        >
          {!isDm && !activeChannel ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-surface-dark p-6 text-gray-400">
                <HashChannelIcon />
              </div>
              <p className="max-w-sm text-lg font-semibold text-white">
                Welcome to your server
              </p>
              <p className="max-w-sm text-sm text-gray-400">
                Pick a text channel on the left to start chatting, or join a
                server using an invite link.
              </p>
            </div>
          ) : isLoading && messages.length === 0 ? (
            <DelayedRender loading delay={500} fallback={<div className="flex-1" />}>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
                <p className="text-sm text-gray-400">Loading messages...</p>
              </div>
            </DelayedRender>
          ) : !isDm && activeChannel && messages.length === 0 ? (
            <div className="flex flex-1 flex-col justify-end pb-6">
              <div className="border-t border-white/10 pt-4">
                <h2 className="text-2xl font-bold text-white">
                  This is the beginning of{" "}
                  <span className="text-primary">#{activeChannel.name}</span>
                </h2>
                <p className="mt-2 text-[15px] text-gray-400">
                  Send a message to spark the conversation.
                </p>
              </div>
            </div>
          ) : messages.length > 0 && scrollParent ? (
            <Virtuoso
              key={virtuosoKey}
              ref={virtuosoRef}
              customScrollParent={scrollParent}
              data={messages}
              computeItemKey={(index) => messages[index - firstItemIndex]?.id ?? index}
              firstItemIndex={firstItemIndex}
              initialTopMostItemIndex={scrollTargetIndexRef.current ?? messages.length - 1}
              alignToBottom
              atBottomThreshold={100}
              followOutput={followOutput}
              atBottomStateChange={handleAtBottomChange}
              startReached={hasMore ? startReached : undefined}
              endReached={hasNewer && fetchNewerMessages ? endReached : undefined}
              increaseViewportBy={400}
              components={{ Footer: () => <div className="h-8" /> }}
              itemContent={(index, msg) => {
                const dataIndex = index - firstItemIndex;
                const prev = dataIndex > 0 ? messages[dataIndex - 1] : undefined;
                const newDay = !prev || isDifferentDay(prev.createdAt, msg.createdAt);
                const showHead =
                  newDay || !prev || prev.authorId !== msg.authorId || isGap(prev, msg);
                return (
                  <div className="pb-0.5">
                    {newDay && <DateSeparator date={msg.createdAt} />}
                    <MessageRow
                      mode={mode}
                      message={msg}
                      showHead={showHead}
                      contextId={contextId}
                      onReply={handleReply}
                      onUserClick={handleUserClick}
                      onMentionClick={isDm ? undefined : handleMentionClick}
                      channels={channelRefs}
                      onChannelClick={handleChannelClick}
                    />
                    {lastOwnMsg?.id === msg.id && seenByLabel && (
                      <div className="mr-4 mt-0.5 text-right text-[11px] text-gray-500">
                        {seenByLabel}
                      </div>
                    )}
                  </div>
                );
              }}
            />
          ) : null}
        </SimpleBar>

        <ScrollToBottomButton
          atBottom={atBottom}
          hasNewer={hasNewer}
          isLoading={isLoading}
          messageCount={messages.length}
          contextId={contextId}
          onClick={handleBottomButtonClick}
        />
      </div>

      {typingNames.length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-400">
          {formatTyping(typingNames)}
        </div>
      )}

      <UnifiedInput
        mode={mode}
        contextId={contextId}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        onSent={stickToBottom}
        channels={isDm ? dmMentionChannels(mutualServers) : undefined}
        gifEnabled={gifEnabled}
        placeholder={isDm
          ? `Message ${otherMember?.displayName ?? otherMember?.username ?? ""}`
          : activeChannel
            ? (replyTarget ? `Reply to ${replyTarget.authorName}...` : `Message #${activeChannel.name}`)
            : "Message"}
      />

      {cardUser && (
        <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />
      )}
    </>
  );

  const channelHeader = !isDm ? (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
      {activeChannel ? (
        <>
          <HashChannelIcon />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-white">
              {activeChannel.name}
            </h1>
          </div>
          <button
            type="button"
            title="Pinned messages"
            onClick={() => void handleOpenPinned()}
            className="relative rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <PinHeaderIcon />
            {(activeChannel.pinnedCount ?? 0) > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">
                {activeChannel.pinnedCount}
              </span>
            )}
          </button>
          <NotifBellMenu channelId={activeChannel.id} />
          {isAdminOrOwner && (
            <button
              type="button"
              title="Channel settings"
              onClick={() => setEditingChannel(true)}
              className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <ChannelSettingsIcon />
            </button>
          )}
          <button
            type="button"
            title="Toggle member list"
            onClick={useLayoutStore.getState().toggleMemberSidebar}
            className="hidden rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white md:block"
          >
            <MembersToggleIcon />
          </button>
          <SearchBar
            searchOpen={searchOpen}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSearch={(q) => { setSearchQuery(q); setSearchOpen(true); }}
            onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
          />
        </>
      ) : (
        <h1 className="text-base font-semibold text-gray-400">Select a channel</h1>
      )}
    </header>
  ) : null;

  if (isDm) {
    return (
      <div className="relative flex min-w-0 flex-1 bg-surface">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
            <AtIcon />
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{otherName}</h2>
            {otherMember && !currentConv?.isGroup && (
              <button
                type="button"
                onClick={() => setShowProfile((p) => !p)}
                title="User profile"
                className={`shrink-0 rounded p-1.5 transition ${showProfile ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"}`}
              >
                <UserProfileIcon />
              </button>
            )}
            <div className="shrink-0">
              <SearchBar
                searchOpen={searchOpen}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onSearch={(q) => { setSearchQuery(q); setSearchOpen(true); }}
                onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
              />
            </div>
          </header>
          {messageList}
        </div>
        {searchOpen ? (
          <div className="absolute inset-0 z-30 md:relative md:inset-auto">
            <SearchDrawer
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
              defaultScope="conversation"
              conversationId={dmConvId ?? undefined}
            />
          </div>
        ) : showProfile && otherMember ? (
          <DmProfilePanel member={otherMember} mutualServers={mutualServers} />
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      {channelHeader}

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {messageList}
        </div>
        {searchOpen ? (
          <div className="absolute inset-0 z-30 md:relative md:inset-auto">
            <SearchDrawer
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
            />
          </div>
        ) : (
          memberSidebar
        )}
      </div>

      {editingChannel && activeChannel && (
        <EditChannelModal
          channel={activeChannel}
          onClose={() => setEditingChannel(false)}
        />
      )}
    </section>
  );
}

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function formatTyping(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function dmMentionChannels(
  mutualServers: { id: string; name: string; channels: { id: string; name: string }[] }[],
): MentionChannel[] {
  return mutualServers.flatMap((s) =>
    s.channels.map((c) => ({ id: c.id, serverId: s.id, name: c.name, serverName: s.name })),
  );
}
