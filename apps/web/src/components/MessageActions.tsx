import type { Message } from "@chat/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmojiPicker } from "@/components/EmojiPicker";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth.store";
import { useMemberStore } from "@/stores/member.store";
import { useMessageStore } from "@/stores/message.store";

interface MessageActionsProps {
  message: Message;
  channelId: string;
}

export function MessageActions({ message, channelId }: MessageActionsProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const myRole = useMemberStore((s) =>
    s.members.find((m) => m.userId === userId),
  )?.role;
  const isAuthor = message.authorId === userId;
  const isAdminOrOwner = myRole === "admin" || myRole === "owner";
  const canDelete = isAuthor || isAdminOrOwner;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content ?? "");
  const btnRef = useRef<HTMLDivElement>(null);
  const [pickerAbove, setPickerAbove] = useState(true);

  const handleReply = useCallback(() => {
    useMessageStore.getState().setReplyTarget({
      id: message.id,
      content: message.content,
      authorName: message.author?.username ?? "Deleted User",
    });
  }, [message]);

  const handleDelete = useCallback(() => {
    getSocket()?.emit("message:delete", { messageId: message.id });
  }, [message.id]);

  const handlePin = useCallback(() => {
    if (message.pinned) {
      getSocket()?.emit("message:unpin", {
        messageId: message.id,
        channelId,
      });
    } else {
      getSocket()?.emit("message:pin", {
        messageId: message.id,
        channelId,
      });
    }
  }, [message.id, message.pinned, channelId]);

  const openEmojiPicker = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPickerAbove(rect.top > 460);
    }
    setShowEmojiPicker((p) => !p);
  }, []);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      getSocket()?.emit("reaction:toggle", {
        messageId: message.id,
        emoji,
      });
      setShowEmojiPicker(false);
    },
    [message.id],
  );

  const handleEditSubmit = useCallback(() => {
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
    if (!showEmojiPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowEmojiPicker(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showEmojiPicker]);

  if (editing) {
    return (
      <div className="mt-1">
        <textarea
          className="w-full rounded bg-[#383a40] px-3 py-1.5 text-sm text-gray-100 outline-none ring-1 ring-white/10 focus:ring-[#5865f2]"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleEditSubmit();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          rows={2}
          autoFocus
        />
        <div className="mt-1 flex gap-2 text-xs text-gray-400">
          <span>
            escape to{" "}
            <button
              type="button"
              className="text-blue-400 hover:underline"
              onClick={() => setEditing(false)}
            >
              cancel
            </button>
          </span>
          <span>•</span>
          <span>
            enter to{" "}
            <button
              type="button"
              className="text-blue-400 hover:underline"
              onClick={handleEditSubmit}
            >
              save
            </button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={btnRef} className="absolute right-2 top-0 z-10 flex items-start">
      <div className="flex items-center gap-0.5 rounded bg-[#2b2d31] shadow-lg ring-1 ring-white/10 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionBtn title="React" onClick={openEmojiPicker}>
          <SmileIcon />
        </ActionBtn>
        <ActionBtn title="Reply" onClick={handleReply}>
          <ReplyIcon />
        </ActionBtn>
        {isAuthor && (
          <ActionBtn
            title="Edit"
            onClick={() => {
              setEditValue(message.content ?? "");
              setEditing(true);
            }}
          >
            <EditIcon />
          </ActionBtn>
        )}
        {isAdminOrOwner && (
          <ActionBtn title={message.pinned ? "Unpin" : "Pin"} onClick={handlePin}>
            <PinIcon />
          </ActionBtn>
        )}
        {canDelete && (
          <ActionBtn title="Delete" onClick={handleDelete} danger>
            <TrashIcon />
          </ActionBtn>
        )}
      </div>
      {showEmojiPicker && (
        <div
          className={`absolute right-0 z-50 ${
            pickerAbove ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 transition ${
        danger
          ? "text-gray-400 hover:text-red-400"
          : "text-gray-400 hover:text-white"
      }`}
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

function ReplyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
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

function PinIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4H7v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1v3.76z" />
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
