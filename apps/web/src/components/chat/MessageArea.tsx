import type { Message, UserStatus } from "@chat/shared";
import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimpleBar from "simplebar-react";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { ChatInputBar, type ChatInputBarHandle, type MentionChannel, type MentionMember } from "@/components/chat/ChatInputBar";
import { DelayedRender } from "@/components/DelayedRender";
import { ScrollToBottomButton } from "@/components/ScrollToBottomButton";

const EmojiPicker = lazy(() =>
  import("@/components/EmojiPicker").then((m) => ({ default: m.EmojiPicker })),
);
import { LinkPreviewCard } from "@/components/LinkPreviewCard";
import { MarkdownContent, type ChannelRef } from "@/components/MarkdownContent";
import { MessageActions } from "@/components/chat/MessageActions";
import { ProfileCard, type ProfileCardUser } from "@/components/ProfileCard";
import { UserAvatar } from "@/components/UserAvatar";
import { useMessageStoreAdapter } from "@/hooks/useMessageStoreAdapter";
import { api } from "@/lib/api";
import { formatSmartTimestamp, formatDateSeparator, isDifferentDay } from "@/lib/format-time";
import { getSocket } from "@/lib/socket";
import { usernameAccentStyle } from "@/lib/username-color";
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

/* ────────────────────────────────────────────
   Unified MessageRow
   ──────────────────────────────────────────── */

const MessageRow = memo(function MessageRow({
  mode,
  message,
  showHead,
  contextId,
  onReply,
  onUserClick,
  onMentionClick,
  channels,
  onChannelClick,
}: {
  mode: "channel" | "dm";
  message: Message;
  showHead: boolean;
  contextId: string;
  onReply: (msg: Message) => void;
  onUserClick?: (authorId: string, rect: DOMRect) => void;
  onMentionClick?: (username: string, rect: DOMRect) => void;
  channels?: ChannelRef[];
  onChannelClick?: (serverId: string, channelId: string) => void;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const isDm = mode === "dm";
  const isWebhook = !isDm && !!message.webhookId && !!message.webhook;
  const isAuthor = message.authorId === userId;
  const name = isWebhook
    ? message.webhook!.name
    : (message.author?.displayName ?? message.author?.username ?? "Deleted User");
  const avatarUrl = isWebhook
    ? message.webhook!.avatarUrl
    : (message.author?.avatarUrl ?? null);
  const attachments = message.attachments ?? [];
  const reactions = message.reactions ?? [];
  const linkPreviews = message.linkPreviews ?? [];

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pickerAbove, setPickerAbove] = useState(true);
  const actionsRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = useCallback(() => {
    setEditValue(message.content ?? "");
    setEditing(true);
  }, [message.content]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      return;
    }
    if (isDm) {
      getSocket()?.emit("dm:edit", { messageId: message.id, conversationId: contextId, content: trimmed });
    } else {
      getSocket()?.emit("message:edit", { messageId: message.id, content: trimmed });
    }
    setEditing(false);
  }, [editValue, message.id, message.content, isDm, contextId]);

  const handleDelete = useCallback(() => {
    if (isDm) {
      getSocket()?.emit("dm:delete", { messageId: message.id, conversationId: contextId });
    } else {
      getSocket()?.emit("message:delete", { messageId: message.id });
    }
  }, [message.id, isDm, contextId]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [editing, editValue]);

  const handleAuthorClick = useCallback(
    (e: React.MouseEvent) => {
      if (!message.authorId || !onUserClick) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onUserClick(message.authorId, rect);
    },
    [message.authorId, onUserClick],
  );

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative flex gap-4 rounded-md px-2 py-0.5 transition ${
        editing ? "bg-white/[0.02]" : "hover:bg-white/[0.03]"
      } ${showHead ? "mt-3 first:mt-1" : "-mt-0.5"}`}
    >
      {/* Actions bar */}
      {!editing && (
        !isDm ? (
          <MessageActions
            message={message}
            channelId={contextId}
            onEdit={handleStartEdit}
            onReply={() => onReply(message)}
          />
        ) : (
          <div ref={actionsRef} className="absolute -top-3 right-2 z-10 flex items-start">
            <div className="flex items-center gap-0.5 rounded bg-surface-dark shadow-lg ring-1 ring-white/10 opacity-0 transition-opacity group-hover:opacity-100">
              <ActionBtn title="React" onClick={() => {
                if (actionsRef.current) {
                  const rect = actionsRef.current.getBoundingClientRect();
                  setPickerAbove(rect.top > 460);
                }
                setEmojiOpen((p) => !p);
              }}>
                <SmileIcon />
              </ActionBtn>
              <ActionBtn title="Reply" onClick={() => onReply(message)}>
                <ReplyArrowIcon />
              </ActionBtn>
              {isAuthor && (
                <>
                  <ActionBtn title="Edit" onClick={handleStartEdit}>
                    <EditIcon />
                  </ActionBtn>
                  <ActionBtn title="Delete" onClick={handleDelete} danger>
                    <TrashIcon />
                  </ActionBtn>
                </>
              )}
            </div>
            {emojiOpen && (
              <div className={`absolute right-0 z-50 ${pickerAbove ? "bottom-full mb-2" : "top-full mt-2"}`}>
                <Suspense fallback={null}>
                  <EmojiPicker
                    onSelect={(emoji) => {
                      getSocket()?.emit("reaction:toggle", { messageId: message.id, emoji });
                      setEmojiOpen(false);
                    }}
                    onClose={() => setEmojiOpen(false)}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )
      )}

      {/* Avatar column */}
      {showHead ? (
        isWebhook ? (
          <div className="shrink-0 self-start">
            <UserAvatar username={name} avatarUrl={avatarUrl} size="lg" />
          </div>
        ) : (
          <button type="button" onClick={handleAuthorClick} className="shrink-0 self-start">
            <UserAvatar username={name} avatarUrl={avatarUrl} size={isDm ? "md" : "lg"} />
          </button>
        )
      ) : (
        <div className={`flex ${isDm ? "w-8" : "w-10"} shrink-0 justify-center pt-1`}>
          {!isDm && (
            <span className="text-[10px] text-gray-500 opacity-0 transition group-hover:opacity-100">
              {formatSmartTimestamp(message.createdAt)}
            </span>
          )}
        </div>
      )}

      {/* Content column */}
      <div className="min-w-0 flex-1 pb-0.5">
        {message.replyTo && (
          <div className="mb-0.5 flex items-center gap-1.5 text-xs text-gray-400">
            <ReplyArrowIcon />
            <span className="font-medium text-gray-300">
              {message.replyTo.author?.displayName ?? message.replyTo.author?.username ?? "Deleted User"}
            </span>
            <span className="truncate">
              {message.replyTo.content || "[attachment]"}
            </span>
          </div>
        )}

        {showHead && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            {isWebhook ? (
              <span className="text-[15px] font-semibold" style={usernameAccentStyle(name)}>
                {name}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleAuthorClick}
                className="text-[15px] font-semibold hover:underline"
                style={usernameAccentStyle(name)}
              >
                {name}
              </button>
            )}
            {message.webhookId && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                BOT
              </span>
            )}
            <time className="text-xs text-gray-500" dateTime={message.createdAt}>
              {formatSmartTimestamp(message.createdAt)}
            </time>
            {!isDm && message.pinned && (
              <span className="rounded bg-yellow-600/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                PINNED
              </span>
            )}
            {message.editedAt && (
              <span className="text-[10px] text-gray-500">(edited)</span>
            )}
          </div>
        )}

        {editing ? (
          <div className="my-0.5">
            <textarea
              ref={textareaRef}
              className="w-full resize-none overflow-hidden rounded-md bg-surface-raised px-3 py-2 text-[15px] leading-relaxed text-gray-100 outline-none ring-1 ring-primary/50 focus:ring-primary"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
            <div className="mt-1 flex gap-2 text-xs text-gray-400">
              <span>
                escape to{" "}
                <button type="button" className="text-link hover:underline" onClick={() => setEditing(false)}>
                  cancel
                </button>
              </span>
              <span>•</span>
              <span>
                enter to{" "}
                <button type="button" className="text-link hover:underline" onClick={handleSaveEdit}>
                  save
                </button>
              </span>
            </div>
          </div>
        ) : message.content ? (
          <div>
            <MarkdownContent content={message.content} onMentionClick={onMentionClick} channels={channels} onChannelClick={onChannelClick} />
            {!showHead && message.editedAt ? (
              <span className="ml-1.5 text-xs text-gray-500">(edited)</span>
            ) : null}
          </div>
        ) : null}

        {attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        )}

        {linkPreviews.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {linkPreviews.map((lp) => (
              <LinkPreviewCard key={lp.id} lp={lp} />
            ))}
          </div>
        )}

        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map((r) => {
              const isMine = userId ? r.userIds.includes(userId) : false;
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => {
                    getSocket()?.emit("reaction:toggle", { messageId: message.id, emoji: r.emoji });
                  }}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${
                    isMine
                      ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                      : "bg-surface-dark text-gray-300 ring-1 ring-white/10 hover:bg-surface-hover"
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

/* ────────────────────────────────────────────
   Action button used in DM mode inline bar
   ──────────────────────────────────────────── */

function ActionBtn({ title, onClick, danger, children }: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`p-1.5 transition ${danger ? "text-gray-400 hover:text-red-400" : "text-gray-400 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function SmileIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/* ────────────────────────────────────────────
   Unified Input
   ──────────────────────────────────────────── */

type PendingFile = {
  file: File;
  preview: string | null;
  uploading: boolean;
  uploaded?: import("@chat/shared").Attachment;
  error?: string;
};

function UnifiedInput({
  mode,
  contextId,
  replyTarget,
  onCancelReply,
  onSent,
  channels,
  gifEnabled,
  placeholder,
}: {
  mode: "channel" | "dm";
  contextId: string;
  replyTarget: { id: string; content: string | null; authorName: string } | null;
  onCancelReply: () => void;
  onSent?: () => void;
  channels?: MentionChannel[];
  gifEnabled?: boolean;
  placeholder: string;
}) {
  const isDm = mode === "dm";
  const inputRef = useRef<ChatInputBarHandle>(null);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const lastTypingEmit = useRef(0);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (replyTarget) inputRef.current?.focus();
  }, [replyTarget]);

  const rawMembers = useMemberStore((s) => s.members);
  const mentionMembers: MentionMember[] = useMemo(
    () =>
      isDm
        ? []
        : rawMembers
            .filter((m) => m.userId !== userId)
            .map((m) => ({
              userId: m.userId,
              username: m.user.username,
              displayName: m.user.displayName,
              avatarUrl: m.user.avatarUrl,
            })),
    [rawMembers, userId, isDm],
  );

  const allChannels = useChannelStore((s) => s.channels);
  const mentionChannels: MentionChannel[] = useMemo(
    () =>
      isDm
        ? (channels ?? [])
        : allChannels
            .filter((c) => c.type === "text")
            .map((c) => ({ id: c.id, serverId: c.serverId, name: c.name })),
    [allChannels, isDm, channels],
  );

  const handleGifSelect = useCallback(
    (url: string) => {
      if (isDm) {
        getSocket()?.emit("dm:send", { conversationId: contextId, content: url });
      } else {
        getSocket()?.emit("message:send", { channelId: contextId, content: url });
      }
    },
    [isDm, contextId],
  );

  function emitTypingThrottled() {
    const now = Date.now();
    if (now - lastTypingEmit.current < 2000) return;
    lastTypingEmit.current = now;
    if (isDm) {
      getSocket()?.emit("dm:typing", { conversationId: contextId });
    } else {
      getSocket()?.emit("typing:start", { channelId: contextId });
    }
  }

  async function uploadFiles(pending: PendingFile[]) {
    const results: PendingFile[] = [...pending];
    for (let i = 0; i < results.length; i++) {
      const p = results[i];
      if (p.uploaded || p.uploading) continue;
      results[i] = { ...p, uploading: true };
      setFiles([...results]);
      try {
        const att = await api.uploadAttachment(p.file);
        results[i] = { ...p, uploading: false, uploaded: att };
      } catch (e) {
        results[i] = { ...p, uploading: false, error: e instanceof Error ? e.message : "Upload failed" };
      }
      setFiles([...results]);
    }
    return results;
  }

  async function send() {
    const content = value.trim();

    let finalFiles = files;
    const pending = files.filter((f) => !f.uploaded && !f.error);
    if (pending.length > 0) {
      finalFiles = await uploadFiles(files);
    }

    const attachmentIds = finalFiles
      .filter((f) => f.uploaded)
      .map((f) => f.uploaded!.id);

    if (!content && attachmentIds.length === 0) return;

    if (isDm) {
      getSocket()?.emit("dm:send", {
        conversationId: contextId,
        content: content || undefined,
        replyToId: replyTarget?.id,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      });
    } else {
      getSocket()?.emit("message:send", {
        channelId: contextId,
        content: content || undefined,
        replyToId: replyTarget?.id,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      });
    }

    setValue("");
    setFiles([]);
    onCancelReply();
    onSent?.();
  }

  async function addFiles(newFiles: FileList | File[]) {
    const maxMb = await api.getMaxUploadSizeMb();
    const maxBytes = maxMb * 1024 * 1024;
    const arr = Array.from(newFiles);
    const tooLarge = arr.filter((f) => f.size > maxBytes);
    if (tooLarge.length > 0) {
      setSizeError(`File too large. Max ${maxMb} MB allowed.`);
      setTimeout(() => setSizeError(null), 5000);
    }
    const valid = tooLarge.length > 0 ? arr.filter((f) => f.size <= maxBytes) : arr;
    if (valid.length === 0) return;
    const pending: PendingFile[] = valid.map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      uploading: false,
    }));
    setFiles((prev) => [...prev, ...pending]);
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return next;
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  return (
    <div
      className={`relative shrink-0 border-t border-black/20 bg-surface px-4 pb-2 pt-2 ${
        dragOver ? "ring-2 ring-inset ring-primary" : ""
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {replyTarget && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-surface-dark px-3 py-1.5 text-xs text-gray-300">
          <span className="text-gray-500">Replying to</span>
          <span className="font-semibold text-white">{replyTarget.authorName}</span>
          <span className="flex-1 truncate text-gray-400">{replyTarget.content || "[attachment]"}</span>
          <button type="button" onClick={onCancelReply} className="text-gray-500 transition hover:text-white">
            <XIcon />
          </button>
        </div>
      )}

      {sizeError && (
        <div className="mb-2 rounded bg-red-500/15 px-3 py-1.5 text-xs text-red-400">
          {sizeError}
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={`${f.file.name}-${i}`} className="relative rounded-lg bg-surface-dark p-1 ring-1 ring-white/10">
              {f.preview ? (
                <img src={f.preview} alt={f.file.name} className="h-20 w-20 rounded object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded text-xs text-gray-400">
                  {f.file.name.split(".").pop()?.toUpperCase()}
                </div>
              )}
              {f.uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
                </div>
              )}
              {f.error && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-900/50 px-1 text-center text-[10px] text-red-300">
                  Failed
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow transition hover:bg-red-500"
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      <ChatInputBar
        ref={inputRef}
        value={value}
        onChange={setValue}
        onSend={() => void send()}
        onTyping={emitTypingThrottled}
        onFilesPicked={(fl) => addFiles(fl)}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={!contextId}
        members={mentionMembers.length > 0 ? mentionMembers : undefined}
        channels={mentionChannels}
        gifEnabled={gifEnabled}
        onGifSelect={handleGifSelect}
      />
    </div>
  );
}

/* ────────────────────────────────────────────
   Channel-only: Pinned panel & SearchBar/Drawer
   ──────────────────────────────────────────── */

import { NotifBellMenu } from "@/components/channel/NotifBellMenu";
import { SearchBar } from "@/components/SearchBar";
import { SearchDrawer } from "@/components/search/SearchDrawer";
import { EditChannelModal } from "@/components/channel/EditChannelModal";

function PinnedPanel({
  messages,
  loading,
  onClose,
  isAdminOrOwner,
  channelId,
  onJump,
}: {
  messages: Message[];
  loading: boolean;
  onClose: () => void;
  isAdminOrOwner: boolean;
  channelId: string;
  onJump: (messageId: string) => void;
}) {
  const handleUnpin = useCallback(
    (messageId: string) => {
      getSocket()?.emit("message:unpin", { messageId, channelId });
    },
    [channelId],
  );

  return (
    <div className="absolute right-4 top-14 z-30 flex max-h-[28rem] w-96 flex-col rounded-lg bg-surface-dark shadow-2xl ring-1 ring-white/10">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Pinned Messages</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <SimpleBar className="flex-1">
        {loading ? (
          <p className="p-4 text-center text-sm text-gray-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">
            No pinned messages in this channel.
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {messages.map((m) => {
              const name = m.author?.displayName ?? m.author?.username ?? "Deleted User";
              return (
                <div key={m.id} className="group/pin px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <UserAvatar username={name} avatarUrl={m.author?.avatarUrl ?? null} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-white">{name}</span>
                        <time className="text-[11px] text-gray-500">
                          {formatSmartTimestamp(m.createdAt)}
                        </time>
                      </div>
                      <button type="button" onClick={() => onJump(m.id)} className="mt-0.5 block w-full text-left">
                        <p className="whitespace-pre-wrap break-words text-sm text-gray-300 transition hover:text-white">
                          {m.content || "[attachment]"}
                        </p>
                      </button>
                    </div>
                    {isAdminOrOwner && (
                      <button
                        type="button"
                        title="Unpin message"
                        onClick={() => handleUnpin(m.id)}
                        className="shrink-0 rounded p-1 text-gray-500 opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover/pin:opacity-100"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onJump(m.id)}
                    className="mt-1.5 text-[11px] font-medium text-primary/70 transition hover:text-primary"
                  >
                    Jump to message
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SimpleBar>
    </div>
  );
}

/* ────────────────────────────────────────────
   DM-only: Profile panel + helpers
   ──────────────────────────────────────────── */

function UserProfileIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const statusLabel: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

function dmFormatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function DmProfilePanel({
  member,
  mutualServers,
}: {
  member: {
    userId: string;
    username: string;
    displayName?: string | null;
    avatarUrl: string | null;
    bio: string | null;
    status: string;
    createdAt: string;
  };
  mutualServers?: { id: string; name: string; iconUrl: string | null; channels: { id: string; name: string }[] }[];
}) {
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const resolvedStatus: UserStatus = onlineIds.has(member.userId)
    ? ((member.status === "idle" || member.status === "dnd") ? member.status : "online")
    : "offline";
  const { orchestratedGoToChannel } = useAppNavigate();

  return (
    <div className="flex w-[280px] shrink-0 flex-col border-l border-white/5 bg-surface-dark">
      <SimpleBar className="flex-1">
        <div className="h-24 bg-primary" />
        <div className="px-4 pb-4">
          <div className="-mt-10">
            <div className="inline-block rounded-full border-[5px] border-surface-dark">
              <UserAvatar
                username={member.username}
                avatarUrl={member.avatarUrl}
                size="lg"
                showStatus
                status={resolvedStatus}
              />
            </div>
          </div>

          <h3 className="mt-1 text-lg font-bold text-white">
            {member.displayName ?? member.username}
          </h3>
          {member.displayName != null &&
            member.displayName !== "" &&
            member.displayName !== member.username && (
              <p className="text-sm text-gray-400">@{member.username}</p>
            )}
          <p className="text-xs text-gray-400">{statusLabel[resolvedStatus] ?? "Offline"}</p>

          <div className="my-3 border-t border-white/10" />

          {member.bio && (
            <div className="mb-3">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                About Me
              </p>
              <p className="whitespace-pre-wrap text-sm text-gray-200">
                {member.bio}
              </p>
            </div>
          )}

          {member.createdAt && (
            <div className="mb-3">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Member Since
              </p>
              <p className="text-sm text-gray-200">{dmFormatDate(member.createdAt)}</p>
            </div>
          )}

          {mutualServers && mutualServers.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Mutual Servers — {mutualServers.length}
              </p>
              <div className="space-y-1">
                {mutualServers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void orchestratedGoToChannel(s.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-white/5"
                  >
                    <DmServerIcon name={s.name} iconUrl={s.iconUrl} />
                    <span className="min-w-0 truncate text-sm text-gray-200">
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SimpleBar>
    </div>
  );
}

function DmServerIcon({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return (
      <img src={iconUrl} alt={name} className="h-6 w-6 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/30 text-[11px] font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
