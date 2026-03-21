import type { Attachment } from "@chat/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { EmojiPicker } from "@/components/EmojiPicker";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useMessageStore } from "@/stores/message.store";

const TYPING_INTERVAL_MS = 2000;
const MAX_TEXTAREA_PX = 240;

function formatTyping(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  return "Several people are typing...";
}

type PendingFile = {
  file: File;
  preview: string | null;
  uploading: boolean;
  uploaded?: Attachment;
  error?: string;
};

export function MessageInput() {
  const userId = useAuthStore((s) => s.user?.id);
  const channel = useChannelStore((s) =>
    s.currentChannelId ? s.channels.find((c) => c.id === s.currentChannelId) ?? null : null,
  );
  const channelId = channel?.id ?? null;

  const typingNames = useMessageStore(
    useShallow((s) => {
      const out: string[] = [];
      for (const [uid, entry] of s.typingUsers) {
        if (uid !== userId) out.push(entry.username);
      }
      return out;
    }),
  );
  const replyTarget = useMessageStore((s) => s.replyTarget);
  const setReplyTarget = useMessageStore((s) => s.setReplyTarget);

  const [value, setValue] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingEmit = useRef(0);

  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_PX);
    el.style.height = `${Math.max(next, 44)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  function emitTypingThrottled() {
    if (!channelId) return;
    const now = Date.now();
    if (now - lastTypingEmit.current < TYPING_INTERVAL_MS) return;
    lastTypingEmit.current = now;
    getSocket()?.emit("typing:start", { channelId });
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
        results[i] = {
          ...p,
          uploading: false,
          error: e instanceof Error ? e.message : "Upload failed",
        };
      }
      setFiles([...results]);
    }
    return results;
  }

  async function send() {
    if (!channelId) return;
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

    getSocket()?.emit("message:send", {
      channelId,
      content: content || undefined,
      replyToId: replyTarget?.id,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    });

    setValue("");
    setFiles([]);
    setReplyTarget(null);
    requestAnimationFrame(resize);
  }

  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    const pending: PendingFile[] = arr.map((file) => ({
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

  if (!channel) return null;

  const placeholder = replyTarget
    ? `Reply to ${replyTarget.authorName}...`
    : `Message #${channel.name}`;

  return (
    <div
      className={`shrink-0 border-t border-black/20 bg-surface px-4 pb-4 pt-2 ${
        dragOver ? "ring-2 ring-inset ring-primary" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {replyTarget && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-surface-dark px-3 py-1.5 text-xs text-gray-300">
          <span className="text-gray-500">Replying to</span>
          <span className="font-semibold text-white">
            {replyTarget.authorName}
          </span>
          <span className="flex-1 truncate text-gray-400">
            {replyTarget.content || "[attachment]"}
          </span>
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="text-gray-500 transition hover:text-white"
          >
            <XIcon />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={`${f.file.name}-${i}`}
              className="relative rounded-lg bg-surface-dark p-1 ring-1 ring-white/10"
            >
              {f.preview ? (
                <img
                  src={f.preview}
                  alt={f.file.name}
                  className="h-20 w-20 rounded object-cover"
                />
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

      <div className="relative rounded-lg bg-surface-raised ring-1 ring-black/20 transition focus-within:ring-primary/60">
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-3 text-gray-400 transition hover:text-white"
            title="Attach file"
          >
            <PlusCircleIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            placeholder={placeholder}
            disabled={!channelId}
            className="max-h-[240px] min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] leading-snug text-gray-100 outline-none placeholder:text-gray-500 disabled:opacity-50"
            onChange={(e) => {
              setValue(e.target.value);
              emitTypingThrottled();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            onPaste={handlePaste}
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker((p) => !p)}
            className="shrink-0 p-3 text-gray-400 transition hover:text-white"
            title="Emoji"
          >
            <SmileIcon />
          </button>
        </div>
        {showEmojiPicker && (
          <div className="absolute bottom-full right-0 mb-2 z-50">
            <EmojiPicker
              onSelect={(emoji) => {
                setValue((v) => v + emoji);
                setShowEmojiPicker(false);
                taRef.current?.focus();
              }}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}
      </div>
      {typingNames.length > 0 ? (
        <p className="mt-1.5 h-5 truncate text-xs text-gray-400 transition-opacity">
          {formatTyping(typingNames)}
        </p>
      ) : (
        <div className="mt-1.5 h-5" aria-hidden />
      )}
    </div>
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

function PlusCircleIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
