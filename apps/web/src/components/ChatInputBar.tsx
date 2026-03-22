import { useCallback, useEffect, useRef, useState } from "react";
import { EmojiPicker } from "@/components/EmojiPicker";

const MAX_TEXTAREA_PX = 240;
const MIN_TEXTAREA_PX = 44;

export type ChatInputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onTyping?: () => void;
  onFilesPicked?: (files: FileList) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  placeholder: string;
  disabled?: boolean;
};

export function ChatInputBar({
  value,
  onChange,
  onSend,
  onTyping,
  onFilesPicked,
  onPaste,
  placeholder,
  disabled,
}: ChatInputBarProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_PX);
    el.style.height = `${Math.max(next, MIN_TEXTAREA_PX)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <div className="relative rounded-lg bg-surface-raised ring-1 ring-black/20 transition focus-within:ring-primary/60">
      <div className="flex items-end">
        {onFilesPicked && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="shrink-0 p-3 text-gray-400 transition hover:text-white"
              title="Attach file"
            >
              <PlusCircleIcon />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) onFilesPicked(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}

        <textarea
          ref={taRef}
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          className="max-h-[240px] min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] leading-snug text-gray-100 outline-none placeholder:text-gray-500 disabled:opacity-50"
          onChange={(e) => {
            onChange(e.target.value);
            onTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          onPaste={onPaste}
        />

        <button
          type="button"
          onClick={() => setEmojiOpen((p) => !p)}
          className="shrink-0 p-3 text-gray-400 transition hover:text-white"
          title="Emoji"
        >
          <SmileIcon />
        </button>
      </div>

      {emojiOpen && (
        <div className="absolute bottom-full right-0 z-50 mb-2">
          <EmojiPicker
            onSelect={(emoji) => {
              onChange(value + emoji);
              setEmojiOpen(false);
              taRef.current?.focus();
            }}
            onClose={() => setEmojiOpen(false)}
          />
        </div>
      )}
    </div>
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
