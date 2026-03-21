import type { Message } from "@chat/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { EmojiPicker } from "@/components/EmojiPicker";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { usernameAccentStyle } from "@/lib/username-color";
import { useAuthStore } from "@/stores/auth.store";
import { useDmStore } from "@/stores/dm.store";

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

  const otherName = useMemo(() => {
    if (!currentConv) return "";
    if (currentConv.isGroup) {
      return (
        currentConv.groupName ||
        currentConv.members.map((m) => m.username).join(", ")
      );
    }
    return (
      currentConv.members.find((m) => m.userId !== user?.id)?.username ??
      "Unknown"
    );
  }, [currentConv, user?.id]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevConvRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentConvId) {
      clearMessages();
      prevConvRef.current = null;
      return;
    }
    if (prevConvRef.current !== currentConvId) {
      prevConvRef.current = currentConvId;
      clearMessages();
      joinDmRoom(currentConvId);
      fetchMessages(currentConvId);
    }
  }, [currentConvId, clearMessages, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  const loadMore = useCallback(() => {
    if (!currentConvId || !hasMore || isLoading || messages.length === 0) return;
    const oldest = messages[0];
    fetchMessages(currentConvId, oldest.id);
  }, [currentConvId, hasMore, isLoading, messages, fetchMessages]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop < 100) loadMore();
  }, [loadMore]);

  if (!currentConvId || !currentConv) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-[#313338] text-center">
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
    <div className="flex min-w-0 flex-1 flex-col bg-[#313338]">
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <AtIcon />
        <h2 className="text-[15px] font-semibold text-white">{otherName}</h2>
      </header>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2"
      >
        {isLoading && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-[#5865f2]" />
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoading}
                className="mb-2 self-center text-xs text-[#5865f2] hover:underline disabled:opacity-50"
              >
                {isLoading ? "Loading…" : "Load older messages"}
              </button>
            )}
            {messages.map((msg, idx) => (
              <DmMessageRow
                key={msg.id}
                message={msg}
                prevMessage={messages[idx - 1]}
                isOwn={msg.authorId === user?.id}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <DmInput conversationId={currentConvId} otherName={otherName} />
    </div>
  );
}

function DmMessageRow({
  message,
  prevMessage,
  isOwn,
}: {
  message: Message;
  prevMessage?: Message;
  isOwn: boolean;
}) {
  const showHeader =
    !prevMessage ||
    prevMessage.authorId !== message.authorId ||
    new Date(message.createdAt).getTime() -
      new Date(prevMessage.createdAt).getTime() >
      5 * 60 * 1000;

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`group relative flex gap-4 px-2 py-0.5 hover:bg-white/[0.02] ${showHeader ? "mt-3" : ""}`}
    >
      {showHeader ? (
        <UserAvatar
          username={message.author?.username ?? "Deleted User"}
          avatarUrl={message.author?.avatarUrl ?? null}
          size="md"
        />
      ) : (
        <div className="w-8 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span
              className="text-sm font-semibold"
              style={usernameAccentStyle(message.author?.username ?? "Deleted User")}
            >
              {message.author?.username ?? "Deleted User"}
            </span>
            <time className="text-[11px] text-gray-400">{time}</time>
            {message.editedAt && (
              <span className="text-[10px] text-gray-500">(edited)</span>
            )}
          </div>
        )}

        {message.content && (
          <p className="break-words text-[15px] leading-relaxed text-gray-100">
            {message.content}
          </p>
        )}

        {message.attachments?.map((att) => (
          <AttachmentPreview key={att.id} attachment={att} />
        ))}

        {message.linkPreviews?.map((lp) => (
          <a
            key={lp.id}
            href={lp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block max-w-md rounded border-l-4 border-[#5865f2] bg-[#2b2d31] p-3"
          >
            {lp.siteName && (
              <p className="text-xs text-gray-400">{lp.siteName}</p>
            )}
            {lp.title && (
              <p className="text-sm font-semibold text-[#00aff4]">{lp.title}</p>
            )}
            {lp.description && (
              <p className="mt-1 text-xs text-gray-300 line-clamp-2">
                {lp.description}
              </p>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

function DmInput({
  conversationId,
  otherName,
}: {
  conversationId: string;
  otherName: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<
    { file: File; preview: string; uploading: boolean }[]
  >([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
        attachmentIds,
      });
    }
    setText("");
  }, [text, files, conversationId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newFiles = Array.from(e.target.files ?? []).map((file) => ({
        file,
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "",
        uploading: false,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
      e.target.value = "";
    },
    [],
  );

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className="shrink-0 px-4 pb-6 pt-1">
      {files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto rounded-lg bg-[#2b2d31] p-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="relative h-16 w-16 shrink-0 rounded bg-[#1e1f22]"
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

      <div className="flex items-end gap-2 rounded-lg bg-[#383a40] px-4 py-2.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 pb-0.5 text-gray-400 transition hover:text-white"
        >
          <PlusCircleIcon />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${otherName}`}
          rows={1}
          className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-[15px] text-white placeholder-gray-400 outline-none"
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => setEmojiOpen(!emojiOpen)}
            className="shrink-0 pb-0.5 text-gray-400 transition hover:text-white"
          >
            <SmileIcon />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-full right-0 z-50 mb-2">
              <EmojiPicker
                onSelect={(emoji) => {
                  setText((prev) => prev + emoji);
                  setEmojiOpen(false);
                }}
                onClose={() => setEmojiOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
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

function PlusCircleIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
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
