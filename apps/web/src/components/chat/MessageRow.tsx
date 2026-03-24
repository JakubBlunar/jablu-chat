import type { Message } from "@chat/shared";
import { Suspense, lazy, memo, useCallback, useEffect, useRef, useState } from "react";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { LinkPreviewCard } from "@/components/LinkPreviewCard";
import { MarkdownContent, type ChannelRef } from "@/components/MarkdownContent";
import { MessageActions } from "@/components/chat/MessageActions";
import { UserAvatar } from "@/components/UserAvatar";
import { formatSmartTimestamp } from "@/lib/format-time";
import { getSocket } from "@/lib/socket";
import { usernameAccentStyle } from "@/lib/username-color";
import { useAuthStore } from "@/stores/auth.store";

const EmojiPicker = lazy(() =>
  import("@/components/EmojiPicker").then((m) => ({ default: m.EmojiPicker })),
);

function ReplyArrowIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

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

export const MessageRow = memo(function MessageRow({
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
