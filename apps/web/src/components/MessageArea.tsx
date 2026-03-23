import type { Message, UserStatus } from "@chat/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimpleBar from "simplebar-react";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { DelayedRender } from "@/components/DelayedRender";
import { EditChannelModal } from "@/components/EditChannelModal";
import { LinkPreviewCard } from "@/components/LinkPreviewCard";
import { MarkdownContent, type ChannelRef } from "@/components/MarkdownContent";
import { useAppNavigate } from "@/hooks/useAppNavigate";
import { MessageActions } from "@/components/MessageActions";
import { MessageInput } from "@/components/MessageInput";
import { NotifBellMenu } from "@/components/NotifBellMenu";
import { ProfileCard, type ProfileCardUser } from "@/components/ProfileCard";
import { SearchBar } from "@/components/SearchBar";
import { SearchDrawer } from "@/components/SearchDrawer";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api";
import { formatSmartTimestamp, formatDateSeparator, isDifferentDay } from "@/lib/format-time";
import { getSocket } from "@/lib/socket";
import { usernameAccentStyle } from "@/lib/username-color";
import { useStickyScroll } from "@/hooks/useStickyScroll";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useLayoutStore } from "@/stores/layout.store";
import { useMemberStore } from "@/stores/member.store";
import { useMessageStore } from "@/stores/message.store";

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

export function MessageArea({ memberSidebar }: { memberSidebar?: React.ReactNode }) {
  const channel = useChannelStore((s) =>
    s.currentChannelId ? s.channels.find((c) => c.id === s.currentChannelId) ?? null : null,
  );
  const channelId = channel?.id ?? null;

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const messages = useMessageStore((s) => s.messages);
  const isLoading = useMessageStore((s) => s.isLoading);
  const hasMore = useMessageStore((s) => s.hasMore);
  const hasNewer = useMessageStore((s) => s.hasNewer);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const fetchMessagesAround = useMessageStore((s) => s.fetchMessagesAround);
  const fetchNewerMessages = useMessageStore((s) => s.fetchNewerMessages);
  const clearMessages = useMessageStore((s) => s.clearMessages);
  const scrollToMessageId = useMessageStore((s) => s.scrollToMessageId);

  const {
    scrollRef,
    contentRef,
    showScrollBtn,
    scrollToBottom,
    stickToBottom,
    onScroll,
    resetForItem,
    suppressAutoScrollRef,
  } = useStickyScroll(channelId, messages.length, hasNewer);

  useEffect(() => {
    if (!scrollToMessageId || isLoading || messages.length === 0) return;
    const targetId = scrollToMessageId;

    const tryScroll = (attempts = 0) => {
      const el = document.getElementById(`msg-${targetId}`);
      if (el) {
        useMessageStore.getState().setScrollToMessageId(null);
        el.scrollIntoView({ behavior: "instant", block: "center" });
        el.classList.add("bg-primary/10");
        setTimeout(() => el.classList.remove("bg-primary/10"), 3000);

        // Re-center as images/embeds load and shift layout
        const content = contentRef.current;
        const scroller = scrollRef.current;
        if (content && scroller) {
          let userScrolled = false;
          const stopOnUserScroll = () => { userScrolled = true; };
          scroller.addEventListener("wheel", stopOnUserScroll, { once: true });
          scroller.addEventListener("touchmove", stopOnUserScroll, { once: true });

          const obs = new ResizeObserver(() => {
            if (!userScrolled) {
              el.scrollIntoView({ behavior: "instant", block: "center" });
            }
          });
          obs.observe(content);
          setTimeout(() => {
            obs.disconnect();
            scroller.removeEventListener("wheel", stopOnUserScroll);
            scroller.removeEventListener("touchmove", stopOnUserScroll);
          }, 5000);
        }
      } else if (attempts < 10) {
        setTimeout(() => tryScroll(attempts + 1), 50);
      } else {
        useMessageStore.getState().setScrollToMessageId(null);
      }
    };
    requestAnimationFrame(() => tryScroll());
  }, [scrollToMessageId, isLoading, messages]);

  const prevCh = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const prev = prevCh.current;

    if (prev && prev !== channelId) {
      socket?.emit("channel:leave", { channelId: prev });
    }

    if (channelId) {
      socket?.emit("channel:join", { channelId });
      prevCh.current = channelId;

      const pendingScrollId = useMessageStore.getState().scrollToMessageId;
      if (pendingScrollId) {
        suppressAutoScrollRef.current = true;
      }

      clearMessages();
      resetForItem();

      if (pendingScrollId) {
        void fetchMessagesAround(channelId, pendingScrollId);
      } else {
        void fetchMessages(channelId);
      }
    } else {
      prevCh.current = null;
      clearMessages();
    }

    return () => {
      if (channelId) {
        getSocket()?.emit("channel:leave", { channelId });
      }
    };
  }, [channelId, clearMessages, fetchMessages, fetchMessagesAround, resetForItem, suppressAutoScrollRef]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!channelId || !messages.length || loadingRef.current) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    loadingRef.current = true;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    await fetchMessages(channelId, oldestId);
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight - prevHeight;
    });
    loadingRef.current = false;
  }, [channelId, messages, fetchMessages]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          void loadMore();
        }
      },
      { root: container, rootMargin: "200px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const loadingNewerRef = useRef(false);

  const loadNewer = useCallback(async () => {
    if (!channelId || !messages.length || loadingNewerRef.current) return;
    loadingNewerRef.current = true;
    await fetchNewerMessages(channelId);
    loadingNewerRef.current = false;
  }, [channelId, messages, fetchNewerMessages]);

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNewer && !isLoading) {
          void loadNewer();
        }
      },
      { root: container, rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNewer, isLoading, loadNewer]);

  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);

  useEffect(() => {
    setPinnedOpen(false);
    setPinnedMessages([]);
  }, [channelId]);

  const [editingChannel, setEditingChannel] = useState(false);

  const userId = useAuthStore((s) => s.user?.id);
  const myRole = useMemberStore((s) =>
    s.members.find((m) => m.userId === userId),
  )?.role;
  const isAdminOrOwner = myRole === "admin" || myRole === "owner";

  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      setPinnedOpen(false);
      requestAnimationFrame(() => {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("bg-primary/10");
          setTimeout(() => el.classList.remove("bg-primary/10"), 2000);
        }
      });
    },
    [],
  );

  const members = useMemberStore((s) => s.members);
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const [cardUser, setCardUser] = useState<ProfileCardUser | null>(null);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const closeCard = useCallback(() => setCardUser(null), []);

  const handleUserClick = useCallback(
    (authorId: string, rect: DOMRect) => {
      const member = members.find((m) => m.userId === authorId);
      if (!member) return;
      const status: UserStatus = (member.user.status as UserStatus) ??
        (onlineIds.has(authorId) ? "online" : "offline");
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
    [members, onlineIds],
  );

  const handleMentionClick = useCallback(
    (username: string, rect: DOMRect) => {
      const member = members.find(
        (m) => m.user.username.toLowerCase() === username.toLowerCase(),
      );
      if (!member) return;
      const status: UserStatus = (member.user.status as UserStatus) ??
        (onlineIds.has(member.userId) ? "online" : "offline");
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
    [members, onlineIds],
  );

  const allChannels = useChannelStore((s) => s.channels);
  const channelRefs: ChannelRef[] = useMemo(
    () =>
      allChannels
        .filter((c) => c.type === "text")
        .map((c) => ({ id: c.id, serverId: c.serverId, name: c.name })),
    [allChannels],
  );
  const { goToChannel } = useAppNavigate();
  const handleChannelClick = useCallback(
    (serverId: string, chId: string) => goToChannel(serverId, chId),
    [goToChannel],
  );

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
    if (!pinnedOpen) return;
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

  const messageContent = (
    <>
      {pinnedOpen && channelId && (
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
          scrollableNodeProps={{ ref: scrollRef, onScroll }}
        >
          <div ref={contentRef}>
            {!channel ? (
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
            ) : (
              <>
                <div ref={sentinelRef} className="h-1 shrink-0" />
                {isLoading && messages.length > 0 && hasMore && (
                  <div className="mb-2 flex justify-center">
                    <span className="text-xs text-gray-500">Loading…</span>
                  </div>
                )}

                {isLoading && messages.length === 0 ? (
                  <DelayedRender loading delay={500} fallback={<div className="flex-1" />}>
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
                      <p className="text-sm text-gray-400">Loading messages...</p>
                    </div>
                  </DelayedRender>
                ) : messages.length === 0 ? (
                  <div className="flex flex-1 flex-col justify-end pb-6">
                    <div className="border-t border-white/10 pt-4">
                      <h2 className="text-2xl font-bold text-white">
                        This is the beginning of{" "}
                        <span className="text-primary">#{channel.name}</span>
                      </h2>
                      <p className="mt-2 text-[15px] text-gray-400">
                        Send a message to spark the conversation.
                      </p>
                    </div>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-0.5 pb-2">
                    {messages.map((msg, i) => {
                      const prev = i > 0 ? messages[i - 1] : undefined;
                      const newDay = !prev || isDifferentDay(prev.createdAt, msg.createdAt);
                      const showHead =
                        newDay || !prev || prev.authorId !== msg.authorId || isGap(prev, msg);
                      return (
                        <li key={msg.id}>
                          {newDay && <DateSeparator date={msg.createdAt} />}
                          <MessageRow
                            message={msg}
                            showHead={showHead}
                            channelId={channelId!}
                            onUserClick={handleUserClick}
                            onMentionClick={handleMentionClick}
                            channels={channelRefs}
                            onChannelClick={handleChannelClick}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {hasNewer && (
                  <div className="mb-2 flex justify-center">
                    <span className="text-xs text-gray-500">Loading newer…</span>
                  </div>
                )}
                <div ref={bottomSentinelRef} className="h-1 shrink-0" />
              </>
            )}
          </div>
        </SimpleBar>

        {(showScrollBtn || hasNewer) && (
          <button
            type="button"
            onClick={() => {
              if (hasNewer && channelId) {
                clearMessages();
                resetForItem();
                void fetchMessages(channelId);
              } else {
                scrollToBottom();
              }
            }}
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-primary/80"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            {hasNewer ? "Jump to present" : "New messages"}
          </button>
        )}
      </div>

      <MessageInput key={channel?.id ?? "no-channel"} onSent={stickToBottom} />

      {cardUser && (
        <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />
      )}
    </>
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        {channel ? (
          <>
            <HashChannelIcon />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-white">
                {channel.name}
              </h1>
            </div>
            <button
              type="button"
              title="Pinned messages"
              onClick={() => void handleOpenPinned()}
              className="relative rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <PinHeaderIcon />
              {(channel.pinnedCount ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">
                  {channel.pinnedCount}
                </span>
              )}
            </button>
            <NotifBellMenu channelId={channel.id} />
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
              onSearch={(q) => {
                setSearchQuery(q);
                setSearchOpen(true);
              }}
              onClose={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            />
          </>
        ) : (
          <h1 className="text-base font-semibold text-gray-400">
            Select a channel
          </h1>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {messageContent}
        </div>
        {searchOpen ? (
          <SearchDrawer
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClose={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
          />
        ) : (
          memberSidebar
        )}
      </div>

      {editingChannel && channel && (
        <EditChannelModal
          channel={channel}
          onClose={() => setEditingChannel(false)}
        />
      )}
    </section>
  );
}

function isGap(a: Message, b: Message): boolean {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return tb - ta > 7 * 60 * 1000;
}

function MessageRow({
  message,
  showHead,
  channelId,
  onUserClick,
  onMentionClick,
  channels,
  onChannelClick,
}: {
  message: Message;
  showHead: boolean;
  channelId: string;
  onUserClick?: (authorId: string, rect: DOMRect) => void;
  onMentionClick?: (username: string, rect: DOMRect) => void;
  channels?: ChannelRef[];
  onChannelClick?: (serverId: string, channelId: string) => void;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const name = message.author?.displayName ?? message.author?.username ?? "Deleted User";
  const avatarUrl = message.author?.avatarUrl ?? null;
  const hasReplyPreview = !!message.replyTo;
  const attachments = message.attachments ?? [];
  const reactions = message.reactions ?? [];
  const linkPreviews = message.linkPreviews ?? [];

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleStartEdit = useCallback(() => {
    setEditValue(message.content ?? "");
    setEditing(true);
  }, [message.content]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== message.content) {
      getSocket()?.emit("message:edit", {
        messageId: message.id,
        content: trimmed,
      });
    }
    setEditing(false);
  }, [editValue, message.id, message.content]);

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
      {!editing && (
        <MessageActions message={message} channelId={channelId} onEdit={handleStartEdit} />
      )}

      {showHead ? (
        <button type="button" onClick={handleAuthorClick} className="shrink-0 self-start">
          <UserAvatar username={name} avatarUrl={avatarUrl} size="lg" />
        </button>
      ) : (
        <div className="flex w-10 shrink-0 justify-center pt-1">
          <span className="text-[10px] text-gray-500 opacity-0 transition group-hover:opacity-100">
            {formatSmartTimestamp(message.createdAt)}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1 pb-0.5">
        {hasReplyPreview && (
          <div className="mb-0.5 flex items-center gap-1.5 text-xs text-gray-400">
            <ReplyArrowIcon />
            <span className="font-medium text-gray-300">
              {message.replyTo!.author?.username ?? "Deleted User"}
            </span>
            <span className="truncate">
              {message.replyTo!.content || "[attachment]"}
            </span>
          </div>
        )}

        {showHead ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <button
              type="button"
              onClick={handleAuthorClick}
              className="text-[15px] font-semibold hover:underline"
              style={usernameAccentStyle(name)}
            >
              {name}
            </button>
            {message.webhookId && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                BOT
              </span>
            )}
            <time
              className="text-xs text-gray-500"
              dateTime={message.createdAt}
            >
              {formatSmartTimestamp(message.createdAt)}
            </time>
            {message.pinned && (
              <span className="rounded bg-yellow-600/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                PINNED
              </span>
            )}
          </div>
        ) : null}

        {editing ? (
          <div className="my-0.5">
            <textarea
              ref={textareaRef}
              className="w-full resize-none overflow-hidden rounded-md bg-surface-raised px-3 py-2 text-[15px] leading-relaxed text-gray-100 outline-none ring-1 ring-primary/50 focus:ring-primary"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                }
                if (e.key === "Escape") handleCancelEdit();
              }}
              autoFocus
            />
            <div className="mt-1 flex gap-2 text-xs text-gray-400">
              <span>
                escape to{" "}
                <button type="button" className="text-link hover:underline" onClick={handleCancelEdit}>
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
            {message.editedAt ? (
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
                    getSocket()?.emit("reaction:toggle", {
                      messageId: message.id,
                      emoji: r.emoji,
                    });
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
}

function ReplyArrowIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
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
                      <button
                        type="button"
                        onClick={() => onJump(m.id)}
                        className="mt-0.5 block w-full text-left"
                      >
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
