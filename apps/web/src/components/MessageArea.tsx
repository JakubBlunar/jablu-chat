import type { Message } from "@chat/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { MessageActions } from "@/components/MessageActions";
import { MessageInput } from "@/components/MessageInput";
import { SearchBar } from "@/components/SearchBar";
import { UserAvatar } from "@/components/UserAvatar";
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

  async function loadMore() {
    if (!channelId || !messages.length || isLoading) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    await fetchMessages(channelId, oldestId);
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      const h = node.scrollHeight;
      node.scrollTop = h - prevHeight;
    });
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#313338]">
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        {channel ? (
          <>
            <HashChannelIcon />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-white">
                {channel.name}
              </h1>
            </div>
            <SearchBar />
          </>
        ) : (
          <h1 className="text-base font-semibold text-gray-400">
            Select a channel
          </h1>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2"
      >
        {!channel ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="rounded-full bg-[#2b2d31] p-6 text-gray-400">
              <HashChannelIcon />
            </div>
            <p className="max-w-sm text-lg font-semibold text-white">
              Welcome to your server
            </p>
            <p className="max-w-sm text-sm text-gray-400">
              Pick a text channel on the left to start chatting, or create a
              server from the sidebar.
            </p>
          </div>
        ) : (
          <>
            {hasMore ? (
              <div className="mb-4 flex justify-center">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void loadMore()}
                  className="rounded-md bg-[#2b2d31] px-3 py-1.5 text-xs font-medium text-gray-300 ring-1 ring-white/10 transition hover:bg-[#404249] hover:text-white disabled:opacity-50"
                >
                  {isLoading ? "Loading..." : "Load more"}
                </button>
              </div>
            ) : null}

            {isLoading && messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-[#5865f2]" />
                <p className="text-sm text-gray-400">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-1 flex-col justify-end pb-6">
                <div className="border-t border-white/10 pt-4">
                  <h2 className="text-2xl font-bold text-white">
                    This is the beginning of{" "}
                    <span className="text-[#5865f2]">#{channel.name}</span>
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
                        channelId={channelId}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

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
  const name = message.author?.username ?? "Unknown";
  const avatarUrl = message.author?.avatarUrl;
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
              {message.replyTo!.author.username}
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
          <p className="whitespace-pre-wrap break-words text-[15px] text-gray-200">
            {message.content}
            {message.editedAt ? (
              <span className="ml-1.5 text-xs text-gray-500">(edited)</span>
            ) : null}
          </p>
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
                className="flex max-w-md overflow-hidden rounded-lg border-l-4 border-[#5865f2] bg-[#2b2d31] transition hover:bg-[#35373c]"
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
                      ? "bg-[#5865f2]/20 text-[#5865f2] ring-1 ring-[#5865f2]/40"
                      : "bg-[#2b2d31] text-gray-300 ring-1 ring-white/10 hover:bg-[#35373c]"
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
