import type { Message } from "@chat/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import SimpleBar from "simplebar-react";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { MarkdownContent } from "@/components/MarkdownContent";
import { MessageActions } from "@/components/MessageActions";
import { MessageInput } from "@/components/MessageInput";
import { SearchBar } from "@/components/SearchBar";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { usernameAccentStyle } from "@/lib/username-color";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useMessageStore } from "@/stores/message.store";

function HashChannelIcon() {
  return (
    <svg className="h-6 w-6 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  );
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageArea() {
  const channel = useChannelStore((s) =>
    s.currentChannelId ? s.channels.find((c) => c.id === s.currentChannelId) ?? null : null,
  );
  const channelId = channel?.id ?? null;

  const messages = useMessageStore((s) => s.messages);
  const isLoading = useMessageStore((s) => s.isLoading);
  const hasMore = useMessageStore((s) => s.hasMore);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const clearMessages = useMessageStore((s) => s.clearMessages);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickBottom, setStickBottom] = useState(true);
  const prevLen = useRef(0);
  const prevCh = useRef<string | null>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setStickBottom(nearBottom);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const prev = prevCh.current;

    if (prev && prev !== channelId) {
      socket?.emit("channel:leave", { channelId: prev });
    }

    if (channelId) {
      socket?.emit("channel:join", { channelId });
      prevCh.current = channelId;
      clearMessages();
      void fetchMessages(channelId);
    } else {
      prevCh.current = null;
      clearMessages();
    }

    return () => {
      if (channelId) {
        getSocket()?.emit("channel:leave", { channelId });
      }
    };
  }, [channelId, clearMessages, fetchMessages]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (messages.length > prevLen.current && stickBottom) {
      el.scrollTop = el.scrollHeight;
    }
    prevLen.current = messages.length;
  }, [messages.length, stickBottom]);

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

  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);

  const handleOpenPinned = useCallback(async () => {
    if (!channelId) return;
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
  }, [channelId]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-surface">
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
              className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <PinHeaderIcon />
            </button>
            <SearchBar />
          </>
        ) : (
          <h1 className="text-base font-semibold text-gray-400">
            Select a channel
          </h1>
        )}
      </header>

      {pinnedOpen && (
        <PinnedPanel
          messages={pinnedMessages}
          loading={pinnedLoading}
          onClose={() => setPinnedOpen(false)}
        />
      )}

      <SimpleBar
        className="flex min-h-0 flex-1 flex-col px-4 py-2"
        scrollableNodeProps={{ ref: scrollRef, onScroll }}
      >
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
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
                <p className="text-sm text-gray-400">Loading messages...</p>
              </div>
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
                  const showHead =
                    !prev || prev.authorId !== msg.authorId || isGap(prev, msg);
                  return (
                    <li key={msg.id}>
                      <MessageRow
                        message={msg}
                        showHead={showHead}
                        channelId={channelId!}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </SimpleBar>

      <MessageInput key={channel?.id ?? "no-channel"} />
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
}: {
  message: Message;
  showHead: boolean;
  channelId: string;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const name = message.author?.username ?? "Deleted User";
  const avatarUrl = message.author?.avatarUrl ?? null;
  const hasReplyPreview = !!message.replyTo;
  const attachments = message.attachments ?? [];
  const reactions = message.reactions ?? [];
  const linkPreviews = message.linkPreviews ?? [];

  return (
    <div
      className={`group relative flex gap-4 rounded-md px-2 py-0.5 transition hover:bg-white/[0.03] ${
        showHead ? "mt-3 first:mt-1" : "-mt-0.5"
      }`}
    >
      <MessageActions message={message} channelId={channelId} />

      {showHead ? (
        <UserAvatar username={name} avatarUrl={avatarUrl} size="lg" />
      ) : (
        <div className="flex w-10 shrink-0 justify-center pt-1">
          <span className="text-[10px] text-gray-500 opacity-0 transition group-hover:opacity-100">
            {formatMessageTime(message.createdAt)}
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
            <span
              className="text-[15px] font-semibold"
              style={usernameAccentStyle(name)}
            >
              {name}
            </span>
            {message.webhookId && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                BOT
              </span>
            )}
            <time
              className="text-xs text-gray-500"
              dateTime={message.createdAt}
            >
              {formatMessageTime(message.createdAt)}
            </time>
            {message.pinned && (
              <span className="rounded bg-yellow-600/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                PINNED
              </span>
            )}
          </div>
        ) : null}

        {message.content && (
          <div>
            <MarkdownContent content={message.content} />
            {message.editedAt ? (
              <span className="ml-1.5 text-xs text-gray-500">(edited)</span>
            ) : null}
          </div>
        )}

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
              <a
                key={lp.id}
                href={lp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex max-w-md overflow-hidden rounded-lg border-l-4 border-primary bg-surface-dark transition hover:bg-surface-hover"
              >
                {lp.imageUrl && (
                  <img
                    src={lp.imageUrl}
                    alt=""
                    className="hidden h-24 w-24 shrink-0 object-cover sm:block"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 p-3">
                  {lp.siteName && (
                    <p className="text-xs font-medium text-gray-400">
                      {lp.siteName}
                    </p>
                  )}
                  {lp.title && (
                    <p className="mt-0.5 text-sm font-semibold text-blue-400 line-clamp-1">
                      {lp.title}
                    </p>
                  )}
                  {lp.description && (
                    <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">
                      {lp.description}
                    </p>
                  )}
                </div>
              </a>
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
}: {
  messages: Message[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-4 top-14 z-30 flex max-h-96 w-80 flex-col rounded-lg bg-surface-dark shadow-2xl ring-1 ring-white/10">
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
            {messages.map((m) => (
              <div key={m.id} className="px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">
                    {m.author?.username ?? "Deleted User"}
                  </span>
                  <time className="text-[11px] text-gray-500">
                    {formatMessageTime(m.createdAt)}
                  </time>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-300">
                  {m.content || "[attachment]"}
                </p>
              </div>
            ))}
          </div>
        )}
      </SimpleBar>
    </div>
  );
}
