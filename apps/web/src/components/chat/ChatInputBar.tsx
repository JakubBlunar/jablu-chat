import { EyeSlashIcon, GifIcon, PlusCircleIcon, SmileIcon } from '@/components/chat/chatIcons'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Spinner } from '@/components/ui'
import { useAutosizeTextarea } from '@/hooks/useAutosizeTextarea'
import { useIsMobile } from '@/hooks/useMobile'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { showToast } from '@/stores/toast.store'
import { MAX_MESSAGE_LENGTH } from '@chat/shared'
import { Suspense, forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChannelPopup, CommandPopup, CustomEmojiPopup, MentionPopup } from './ComposerSuggestions'
import type { ChatInputBarProps } from './composerTypes'
import { useComposerSuggestions } from './hooks/useComposerSuggestions'
export type { ChatInputBarProps, CustomEmojiItem, MentionChannel, MentionMember } from './composerTypes'

const EmojiPicker = lazyWithRetry(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
const GifPicker = lazyWithRetry(() => import('@/components/GifPicker').then((m) => ({ default: m.GifPicker })))

function PickerLoading() {
  return (
    <div className="flex h-24 w-[340px] max-w-[80vw] items-center justify-center rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10">
      <Spinner size="md" />
    </div>
  )
}

const CHAR_COUNTER_THRESHOLD = 3800

export type ChatInputBarHandle = {
  focus: () => void
  dismissPopup: () => void
}

export const ChatInputBar = forwardRef<ChatInputBarHandle, ChatInputBarProps>(function ChatInputBar(
  {
    value,
    onChange,
    onSend,
    onTyping,
    onFilesPicked,
    onPaste,
    placeholder,
    disabled,
    hasAttachments,
    members,
    channels,
    gifEnabled,
    onGifSelect,
    onCommand,
    botCommands,
    onBotCommandPick,
    customEmojis,
    onEditLastMessage
  },
  ref
) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const isMobile = useIsMobile()
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)
  const { t } = useTranslation('chat')

  const wrapSelection = useCallback(
    (prefix: string, suffix: string) => {
      const ta = taRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = value.slice(start, end)
      const wrapped = `${prefix}${selected}${suffix}`
      const next = value.slice(0, start) + wrapped + value.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        ta.focus()
        const newCursor = selected ? start + wrapped.length : start + prefix.length
        ta.setSelectionRange(newCursor, newCursor)
      })
    },
    [value, onChange]
  )

  const {
    popupMode,
    popupOpen,
    dismissSuggestions,
    selectedIdx,
    filteredMembers,
    filteredChannels,
    filteredCommands,
    filteredEmojis,
    detectTrigger,
    insertMention,
    insertChannel,
    insertEmoji,
    executeCommand,
    handleSuggestionKeyDown
  } = useComposerSuggestions({
    value,
    onChange,
    members,
    channels,
    onCommand,
    botCommands,
    onBotCommandPick,
    customEmojis,
    taRef,
    wrapperRef
  })
  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus({ preventScroll: true }),
    dismissPopup: dismissSuggestions
  }))
  useAutosizeTextarea(taRef, value)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || handleSuggestionKeyDown(e)) return
      if (
        e.key === 'ArrowUp' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        value.length === 0 &&
        onEditLastMessage
      ) {
        e.preventDefault()
        onEditLastMessage()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (value.length <= MAX_MESSAGE_LENGTH) onSend()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        wrapSelection('**', '**')
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault()
        wrapSelection('*', '*')
        return
      }
    },
    [handleSuggestionKeyDown, onSend, value, wrapSelection, onEditLastMessage]
  )

  return (
    <div
      ref={wrapperRef}
      className="chat-composer relative rounded-lg bg-surface-raised ring-1 ring-black/20 transition focus-within:ring-2 focus-within:ring-primary/55"
    >
      {popupOpen && popupMode === 'mention' && (
        <MentionPopup members={filteredMembers} selectedIdx={selectedIdx} onSelect={insertMention} />
      )}
      {popupOpen && popupMode === 'channel' && (
        <ChannelPopup channels={filteredChannels} selectedIdx={selectedIdx} onSelect={insertChannel} />
      )}
      {popupOpen && popupMode === 'command' && (
        <CommandPopup commands={filteredCommands} selectedIdx={selectedIdx} onSelect={executeCommand} />
      )}
      {popupOpen && popupMode === 'emoji' && (
        <CustomEmojiPopup emojis={filteredEmojis} selectedIdx={selectedIdx} onSelect={insertEmoji} />
      )}

      {showToolbar && !isMobile && (
        <div className="flex items-center gap-0.5 border-b border-white/5 px-2 py-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('**', '**')}
            className="rounded p-1 text-xs font-bold text-gray-400 transition hover:bg-white/10 hover:text-white"
            title={t('formatting.bold')}
          >
            B
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('*', '*')}
            className="rounded p-1 text-xs italic text-gray-400 transition hover:bg-white/10 hover:text-white"
            title={t('formatting.italic')}
          >
            I
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('~~', '~~')}
            className="rounded p-1 text-xs text-gray-400 line-through transition hover:bg-white/10 hover:text-white"
            title={t('formatting.strikethrough')}
          >
            S
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('||', '||')}
            className="rounded p-1 text-xs text-gray-400 transition hover:bg-white/10 hover:text-white"
            title={t('formatting.spoiler')}
          >
            <EyeSlashIcon />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('`', '`')}
            className="rounded p-1 font-mono text-xs text-gray-400 transition hover:bg-white/10 hover:text-white"
            title={t('formatting.inlineCode')}
          >
            {'\u{60}'}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('```\n', '\n```')}
            className="rounded p-1 font-mono text-xs text-gray-400 transition hover:bg-white/10 hover:text-white"
            title={t('formatting.codeBlock')}
          >
            {'\u{60}\u{60}\u{60}'}
          </button>
        </div>
      )}

      <div className="flex items-end">
        {onFilesPicked && (
          <label
            className="shrink-0 cursor-pointer p-3 text-gray-400 transition hover:text-white"
            title={t('attachFile')}
            aria-label={t('attachFile')}
          >
            <PlusCircleIcon />
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files
                if (picked && picked.length > 0) {
                  const snapshot = Array.from(picked)
                  e.target.value = ''
                  onFilesPicked(snapshot)
                } else {
                  e.target.value = ''
                }
              }}
            />
          </label>
        )}

        <textarea
          ref={taRef}
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={t('messageComposer')}
          enterKeyHint={isMobile ? 'send' : undefined}
          className="max-h-[240px] min-h-[44px] min-w-0 flex-1 resize-none bg-transparent py-3 text-base md:text-[15px] leading-snug text-gray-100 outline-none placeholder:text-gray-500 disabled:opacity-50"
          onFocus={() => setShowToolbar(true)}
          onBlur={() => setShowToolbar(false)}
          onChange={(e) => {
            onChange(e.target.value)
            onTyping?.()
            requestAnimationFrame(detectTrigger)
          }}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          onClick={detectTrigger}
          onSelect={detectTrigger}
        />

        {gifEnabled && onGifSelect && (
          <button
            type="button"
            onClick={() => {
              setGifOpen((p) => !p)
              setEmojiOpen(false)
            }}
            className="min-h-11 min-w-11 shrink-0 px-1.5 py-3 text-gray-400 transition hover:text-white"
            title={t('gifPicker')}
            aria-label={t('gifPicker')}
          >
            <GifIcon />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setEmojiOpen((p) => !p)
            setGifOpen(false)
          }}
          className="min-h-11 min-w-11 shrink-0 pl-1.5 pr-3 py-3 text-gray-400 transition hover:text-white"
          title={t('emojiPicker')}
          aria-label={t('emojiPicker')}
        >
          <SmileIcon className="h-5 w-5" />
        </button>

        {(value.trim().length > 0 || hasAttachments) && (
          <button
            type="button"
            onClick={() => {
              if (value.length <= MAX_MESSAGE_LENGTH) onSend()
            }}
            className={`min-h-11 min-w-11 shrink-0 text-primary transition hover:text-primary-hover ${isMobile ? 'px-2.5 py-3' : 'pr-3 py-3'}`}
            aria-label={t('sendMessage')}
          >
            <svg className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        )}
      </div>

      {value.length > CHAR_COUNTER_THRESHOLD && (
        <div
          className={`px-3 pb-1.5 text-right text-xs ${
            value.length > MAX_MESSAGE_LENGTH ? 'text-red-400 font-semibold' : 'text-gray-500'
          }`}
        >
          {value.length} / {MAX_MESSAGE_LENGTH}
        </div>
      )}

      {gifOpen && onGifSelect && (
        <div className="absolute bottom-full right-0 z-50 mb-2">
          <ErrorBoundary
            fallback={null}
            onError={() => {
              setGifOpen(false)
              showToast(t('gifPicker'), t('pickerLoadFailed'))
            }}
          >
            <Suspense fallback={<PickerLoading />}>
              <GifPicker
                onSelect={(url) => {
                  onGifSelect(url)
                  setGifOpen(false)
                }}
                onClose={() => setGifOpen(false)}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {emojiOpen && (
        <div className="absolute bottom-full right-0 z-50 mb-2">
          <ErrorBoundary
            fallback={null}
            onError={() => {
              setEmojiOpen(false)
              showToast(t('emojiPicker'), t('pickerLoadFailed'))
            }}
          >
            <Suspense fallback={<PickerLoading />}>
              <EmojiPicker
                onSelect={(emoji) => {
                  onChange(value + emoji)
                  setEmojiOpen(false)
                  taRef.current?.focus()
                }}
                onClose={() => setEmojiOpen(false)}
                customEmojis={customEmojis}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
})
