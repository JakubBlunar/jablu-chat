import type { Message, UserStatus } from "@chat/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimpleBar from "simplebar-react";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { ChatInputBar } from "@/components/ChatInputBar";
import { LinkPreviewCard } from "@/components/LinkPreviewCard";
import { EmojiPicker } from "@/components/EmojiPicker";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ProfileCard, type ProfileCardUser } from "@/components/ProfileCard";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api";
import { formatSmartTimestamp, formatDateSeparator, isDifferentDay } from "@/lib/format-time";
import { getSocket } from "@/lib/socket";
import { usernameAccentStyle } from "@/lib/username-color";
import { useAuthStore } from "@/stores/auth.store";
import { useDmStore } from "@/stores/dm.store";
import { useMemberStore } from "@/stores/member.store";

function joinDmRoom(conversationId: string) {
  const socket = getSocket();
  if (socket?.connected) {
    socket.emit("dm:join", { conversationId });
  }
}

export function DmMessageArea() {
  const user = useAuthStore((s) => s.user);
  const currentConvId = useDmStore((s) => s.currentConversationId);
  const conversations = useDmStore((s) => s.conversations);
  const messages = useDmStore((s) => s.messages);
  const hasMore = useDmStore((s) => s.hasMore);
  const isLoading = useDmStore((s) => s.isLoading);
  const fetchMessages = useDmStore((s) => s.fetchMessages);
  const clearMessages = useDmStore((s) => s.clearMessages);

  const currentConv = useMemo(
    () => conversations.find((c) => c.id === currentConvId) ?? null,
    [conversations, currentConvId],
  );

  const otherMember = useMemo(() => {
    if (!currentConv || currentConv.isGroup) return null;
    return currentConv.members.find((m) => m.userId !== user?.id) ?? null;
  }, [currentConv, user?.id]);

  const otherName = useMemo(() => {
    if (!currentConv) return "";
    if (currentConv.isGroup) {
      return (
        currentConv.groupName ||
        currentConv.members.map((m) => m.username).join(", ")
      );
    }
    return otherMember?.username ?? "Unknown";
  }, [currentConv, otherMember]);

  const [showProfile, setShowProfile] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevConvRef = useRef<string | null>(null);
  const stickRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!currentConvId) {
      clearMessages();
      prevConvRef.current = null;
      return;
    }
    if (prevConvRef.current !== currentConvId) {
      prevConvRef.current = currentConvId;
      clearMessages();
      stickRef.current = true;
      setShowScrollBtn(false);
      joinDmRoom(currentConvId);
      fetchMessages(currentConvId);
    }
  }, [currentConvId, clearMessages, fetchMessages]);

  useEffect(() => {
    const content = contentRef.current;
    const container = containerRef.current;
    if (!content || !container) return;

    const observer = new ResizeObserver(() => {
      if (stickRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const loadMore = useCallback(() => {
    if (!currentConvId || !hasMore || isLoading || messages.length === 0) return;
    const oldest = messages[0];
    fetchMessages(currentConvId, oldest.id);
  }, [currentConvId, hasMore, isLoading, messages, fetchMessages]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop < 100) loadMore();
    const near = isNearBottom();
    stickRef.current = near;
    setShowScrollBtn(!near);
  }, [loadMore, isNearBottom]);

  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const [cardUser, setCardUser] = useState<ProfileCardUser | null>(null);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const closeCard = useCallback(() => setCardUser(null), []);

  const handleUserClick = useCallback(
    (authorId: string, rect: DOMRect) => {
      const convMember = currentConv?.members.find((m) => m.userId === authorId);
      if (!convMember) return;
      setCardUser({
        id: convMember.userId,
        username: convMember.username,
        avatarUrl: convMember.avatarUrl,
        bio: convMember.bio,
        status: (convMember.status as import("@chat/shared").UserStatus) ?? "offline",
        joinedAt: convMember.createdAt,
      });
      setCardRect(rect);
    },
    [currentConv],
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onTyping = (payload: { conversationId: string; username: string }) => {
      if (payload.conversationId !== currentConvId) return;
      setTypingUsers((prev) =>
        prev.includes(payload.username) ? prev : [...prev, payload.username],
      );
      const tid = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== payload.username));
      }, 3000);
      return () => clearTimeout(tid);
    };
    socket.on("dm:typing", onTyping);
    return () => { socket.off("dm:typing", onTyping); };
  }, [currentConvId]);

  useEffect(() => {
    setTypingUsers([]);
  }, [currentConvId]);

  if (!currentConvId || !currentConv) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-surface text-center">
        <p className="text-lg font-semibold text-white">
          Select a conversation
        </p>
        <p className="max-w-sm text-sm text-gray-400">
          Choose a DM from the sidebar or click on a user to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 bg-surface">
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <AtIcon />
        <h2 className="flex-1 text-[15px] font-semibold text-white">{otherName}</h2>
        {otherMember && !currentConv?.isGroup && (
          <button
            type="button"
            onClick={() => setShowProfile((p) => !p)}
            title="User profile"
            className={`rounded p-1.5 transition ${showProfile ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"}`}
          >
            <UserProfileIcon />
          </button>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <SimpleBar
          className="flex h-full flex-col px-4 py-2"
          scrollableNodeProps={{ ref: containerRef, onScroll: handleScroll }}
        >
          <div ref={contentRef}>
            {isLoading && messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
              </div>
            ) : (
              <>
                {hasMore && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoading}
                    className="mb-2 self-center text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {isLoading ? "Loading…" : "Load older messages"}
                  </button>
                )}
                {messages.map((msg, idx) => {
                  const prev = messages[idx - 1];
                  const newDay = !prev || isDifferentDay(prev.createdAt, msg.createdAt);
                  return (
                    <div key={msg.id}>
                      {newDay && <DmDateSeparator date={msg.createdAt} />}
                      <DmMessageRow
                        message={msg}
                        prevMessage={prev}
                        forceHeader={newDay}
                        conversationId={currentConvId}
                        onReply={setReplyTarget}
                        onUserClick={handleUserClick}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </SimpleBar>

        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-primary/80"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            New messages
          </button>
        )}
      </div>

      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-400">
          {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
        </div>
      )}

      <DmInput
        conversationId={currentConvId}
        otherName={otherName}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
      />
      </div>

      {showProfile && otherMember && (
        <DmProfilePanel member={otherMember} />
      )}

      {cardUser && (
        <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />
      )}
    </div>
  );
}

function DmDateSeparator({ date }: { date: string }) {
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

function DmMessageRow({
  message,
  prevMessage,
  forceHeader,
  conversationId,
  onReply,
  onUserClick,
}: {
  message: Message;
  prevMessage?: Message;
  forceHeader?: boolean;
  conversationId: string;
  onReply: (msg: Message) => void;
  onUserClick?: (authorId: string, rect: DOMRect) => void;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const isAuthor = message.authorId === userId;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pickerAbove, setPickerAbove] = useState(true);
  const actionsRef = useRef<HTMLDivElement>(null);

  const showHeader =
    forceHeader ||
    !prevMessage ||
    prevMessage.authorId !== message.authorId ||
    new Date(message.createdAt).getTime() -
      new Date(prevMessage.createdAt).getTime() >
      5 * 60 * 1000;

  const time = formatSmartTimestamp(message.createdAt);

  const handleAuthorClick = useCallback(
    (e: React.MouseEvent) => {
      if (!message.authorId || !onUserClick) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onUserClick(message.authorId, rect);
    },
    [message.authorId, onUserClick],
  );

  const handleEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      return;
    }
    getSocket()?.emit("dm:edit", {
      messageId: message.id,
      conversationId,
      content: trimmed,
    });
    setEditing(false);
  }, [editText, message, conversationId]);

  const handleDelete = useCallback(() => {
    getSocket()?.emit("dm:delete", {
      messageId: message.id,
      conversationId,
    });
  }, [message.id, conversationId]);

  const reactions = message.reactions ?? [];

  return (
    <div
      className={`group relative flex gap-4 rounded-md px-2 py-0.5 transition hover:bg-white/[0.03] ${showHeader ? "mt-3 first:mt-1" : "-mt-0.5"}`}
    >
      {/* Actions toolbar */}
      <div ref={actionsRef} className="absolute -top-3 right-2 z-10 flex items-start">
        <div className="flex items-center gap-0.5 rounded bg-surface-dark shadow-lg ring-1 ring-white/10 opacity-0 transition-opacity group-hover:opacity-100">
          <DmActionBtn title="React" onClick={() => {
            if (actionsRef.current) {
              const rect = actionsRef.current.getBoundingClientRect();
              setPickerAbove(rect.top > 460);
            }
            setEmojiOpen((p) => !p);
          }}>
            <DmSmileIcon />
          </DmActionBtn>
          <DmActionBtn title="Reply" onClick={() => onReply(message)}>
            <DmReplyIcon />
          </DmActionBtn>
          {isAuthor && (
            <>
              <DmActionBtn title="Edit" onClick={() => { setEditText(message.content ?? ""); setEditing(true); }}>
                <DmEditIcon />
              </DmActionBtn>
              <DmActionBtn title="Delete" onClick={handleDelete} danger>
                <DmTrashIcon />
              </DmActionBtn>
            </>
          )}
        </div>
        {emojiOpen && (
          <div className={`absolute right-0 z-50 ${pickerAbove ? "bottom-full mb-2" : "top-full mt-2"}`}>
            <EmojiPicker
              onSelect={(emoji) => {
                getSocket()?.emit("reaction:toggle", {
                  messageId: message.id,
                  emoji,
                });
                setEmojiOpen(false);
              }}
              onClose={() => setEmojiOpen(false)}
            />
          </div>
        )}
      </div>

      {showHeader ? (
        <button type="button" onClick={handleAuthorClick} className="shrink-0 self-start">
          <UserAvatar
            username={message.author?.username ?? "Deleted User"}
            avatarUrl={message.author?.avatarUrl ?? null}
            size="md"
          />
        </button>
      ) : (
        <div className="w-8 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {message.replyTo && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-gray-400">
            <ReplyArrowIcon />
            <span className="font-medium text-gray-300">
              {message.replyTo.author?.username ?? "Deleted User"}
            </span>
            <span className="truncate">
              {message.replyTo.content || "[attachment]"}
            </span>
          </div>
        )}

        {showHeader && (
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={handleAuthorClick}
              className="text-sm font-semibold hover:underline"
              style={usernameAccentStyle(message.author?.username ?? "Deleted User")}
            >
              {message.author?.username ?? "Deleted User"}
            </button>
            <time className="text-[11px] text-gray-400">{time}</time>
            {message.editedAt && (
              <span className="text-[10px] text-gray-500">(edited)</span>
            )}
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full rounded bg-surface-raised px-3 py-2 text-sm text-white outline-none"
              rows={2}
              autoFocus
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Escape to cancel &middot; Enter to save
            </p>
          </div>
        ) : message.content ? (
          <MarkdownContent content={message.content} />
        ) : null}

        {message.attachments?.map((att) => (
          <AttachmentPreview key={att.id} attachment={att} />
        ))}

        {message.linkPreviews?.map((lp) => (
          <LinkPreviewCard key={lp.id} lp={lp} />
        ))}

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

function DmActionBtn({
  title,
  onClick,
  danger,
  children,
}: {
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

function DmSmileIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function DmReplyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function DmEditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DmTrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function DmInput({
  conversationId,
  otherName,
  replyTarget,
  onCancelReply,
}: {
  conversationId: string;
  otherName: string;
  replyTarget: Message | null;
  onCancelReply: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<
    { file: File; preview: string; uploading: boolean }[]
  >([]);
  const lastTypingRef = useRef<number>(0);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingRef.current < 2000) return;
    lastTypingRef.current = now;
    getSocket()?.emit("dm:typing", { conversationId });
  }, [conversationId]);

  const send = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;

    let attachmentIds: string[] | undefined;
    if (files.length > 0) {
      const uploaded: string[] = [];
      for (const f of files) {
        f.uploading = true;
        setFiles([...files]);
        const att = await api.uploadAttachment(f.file);
        uploaded.push(att.id);
      }
      attachmentIds = uploaded;
      setFiles([]);
    }

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit("dm:send", {
        conversationId,
        content: trimmed || undefined,
        replyToId: replyTarget?.id,
        attachmentIds,
      });
    }
    setText("");
    onCancelReply();
  }, [text, files, conversationId, replyTarget, onCancelReply]);

  const addFiles = useCallback((fileList: FileList) => {
    const newFiles = Array.from(fileList).map((file) => ({
      file,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : "",
      uploading: false,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className="shrink-0 px-4 pb-6 pt-1">
      {replyTarget && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-surface-dark px-3 py-2 text-xs text-gray-400">
          <ReplyArrowIcon />
          <span>
            Replying to{" "}
            <strong className="text-white">
              {replyTarget.author?.username ?? "Deleted User"}
            </strong>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="ml-auto text-gray-500 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto rounded-lg bg-surface-dark p-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="relative h-16 w-16 shrink-0 rounded bg-surface-darkest"
            >
              {f.preview ? (
                <img
                  src={f.preview}
                  alt=""
                  className="h-full w-full rounded object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                  {f.file.name.slice(0, 8)}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute -right-1 -top-1 rounded-full bg-red-600 p-0.5 text-white"
              >
                <XSmallIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      <ChatInputBar
        value={text}
        onChange={setText}
        onSend={() => void send()}
        onTyping={emitTyping}
        onFilesPicked={addFiles}
        placeholder={`Message ${otherName}`}
      />
    </div>
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


function XSmallIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

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

function formatDate(iso?: string): string {
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
}: {
  member: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    status: string;
    createdAt: string;
  };
}) {
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const resolvedStatus: UserStatus = onlineIds.has(member.userId)
    ? ((member.status === "idle" || member.status === "dnd") ? member.status : "online")
    : "offline";

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

          <h3 className="mt-1 text-lg font-bold text-white">{member.username}</h3>
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
            <div>
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Member Since
              </p>
              <p className="text-sm text-gray-200">{formatDate(member.createdAt)}</p>
            </div>
          )}
        </div>
      </SimpleBar>
    </div>
  );
}
