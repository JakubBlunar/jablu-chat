import {
  Suspense,
  forwardRef,
  lazy,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
const GifPicker = lazy(() => import('@/components/GifPicker').then((m) => ({ default: m.GifPicker })))
import { UserAvatar } from '@/components/UserAvatar'

const MAX_TEXTAREA_PX = 240
const MIN_TEXTAREA_PX = 44
const MAX_MESSAGE_LENGTH = 4000
const CHAR_COUNTER_THRESHOLD = 3800

export type MentionMember = {
  userId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export type MentionChannel = {
  id: string
  serverId: string
  name: string
  serverName?: string
}

export type ChatInputBarProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onTyping?: () => void
  onFilesPicked?: (files: FileList) => void
  onPaste?: (e: React.ClipboardEvent) => void
  placeholder: string
  disabled?: boolean
  members?: MentionMember[]
  channels?: MentionChannel[]
  gifEnabled?: boolean
  onGifSelect?: (url: string) => void
}

type PopupMode = 'none' | 'mention' | 'channel'

export type ChatInputBarHandle = {
  focus: () => void
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
    members,
    channels,
    gifEnabled,
    onGifSelect
  },
  ref
) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus()
  }))
  const fileRef = useRef<HTMLInputElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)

  const [popupMode, setPopupMode] = useState<PopupMode>('none')
  const [query, setQuery] = useState('')
  const [triggerStart, setTriggerStart] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const filteredMembers = useMemo(() => {
    if (popupMode !== 'mention' || !members) return []
    const q = query.toLowerCase()
    return members
      .filter((m) => m.username.toLowerCase().includes(q) || (m.displayName && m.displayName.toLowerCase().includes(q)))
      .slice(0, 10)
  }, [popupMode, query, members])

  const filteredChannels = useMemo(() => {
    if (popupMode !== 'channel' || !channels) return []
    const q = query.toLowerCase()
    return channels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10)
  }, [popupMode, query, channels])

  const popupOpen =
    (popupMode === 'mention' && filteredMembers.length > 0) || (popupMode === 'channel' && filteredChannels.length > 0)

  const popupLength = popupMode === 'mention' ? filteredMembers.length : filteredChannels.length

  const detectTrigger = useCallback(() => {
    const el = taRef.current
    if (!el) {
      setPopupMode('none')
      return
    }
    const pos = el.selectionStart
    const text = el.value.slice(0, pos)

    const atIdx = text.lastIndexOf('@')
    const hashIdx = text.lastIndexOf('#')

    const bestIdx = Math.max(atIdx, hashIdx)
    if (bestIdx === -1 || (bestIdx > 0 && /\S/.test(text[bestIdx - 1]))) {
      setPopupMode('none')
      return
    }

    const fragment = text.slice(bestIdx + 1)
    if (/\n/.test(fragment)) {
      setPopupMode('none')
      return
    }

    const trigger = text[bestIdx]
    if (trigger === '@' && members?.length) {
      setPopupMode('mention')
      setQuery(fragment)
      setTriggerStart(bestIdx)
      setSelectedIdx(0)
    } else if (trigger === '#' && channels?.length) {
      setPopupMode('channel')
      setQuery(fragment)
      setTriggerStart(bestIdx)
      setSelectedIdx(0)
    } else {
      setPopupMode('none')
    }
  }, [members, channels])

  const insertMention = useCallback(
    (member: MentionMember) => {
      const el = taRef.current
      if (!el) return
      const before = value.slice(0, triggerStart)
      const after = value.slice(el.selectionStart)
      const insert = `@${member.username} `
      const next = before + insert + after
      onChange(next)
      setPopupMode('none')
      requestAnimationFrame(() => {
        const cursor = before.length + insert.length
        el.setSelectionRange(cursor, cursor)
        el.focus()
      })
    },
    [value, triggerStart, onChange]
  )

  const insertChannel = useCallback(
    (channel: MentionChannel) => {
      const el = taRef.current
      if (!el) return
      const before = value.slice(0, triggerStart)
      const after = value.slice(el.selectionStart)
      const insert = `#${channel.name} `
      const next = before + insert + after
      onChange(next)
      setPopupMode('none')
      requestAnimationFrame(() => {
        const cursor = before.length + insert.length
        el.setSelectionRange(cursor, cursor)
        el.focus()
      })
    },
    [value, triggerStart, onChange]
  )

  const resize = useCallback(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_PX)
    el.style.height = `${Math.max(next, MIN_TEXTAREA_PX)}px`
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (popupOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIdx((i) => (i + 1) % popupLength)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIdx((i) => (i - 1 + popupLength) % popupLength)
          return
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault()
          if (popupMode === 'mention' && filteredMembers[selectedIdx]) {
            insertMention(filteredMembers[selectedIdx])
          } else if (popupMode === 'channel' && filteredChannels[selectedIdx]) {
            insertChannel(filteredChannels[selectedIdx])
          }
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setPopupMode('none')
          return
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (value.length <= MAX_MESSAGE_LENGTH) onSend()
      }
    },
    [
      popupOpen,
      popupMode,
      popupLength,
      filteredMembers,
      filteredChannels,
      selectedIdx,
      insertMention,
      insertChannel,
      onSend
    ]
  )

  return (
    <div className="relative rounded-lg bg-surface-raised ring-1 ring-black/20 transition focus-within:ring-primary/60">
      {popupOpen && popupMode === 'mention' && (
        <MentionPopup members={filteredMembers} selectedIdx={selectedIdx} onSelect={insertMention} />
      )}
      {popupOpen && popupMode === 'channel' && (
        <ChannelPopup channels={filteredChannels} selectedIdx={selectedIdx} onSelect={insertChannel} />
      )}

      <div className="flex items-end">
        {onFilesPicked && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="shrink-0 p-3 text-gray-400 transition hover:text-white"
              title="Attach file"
              aria-label="Attach file"
            >
              <PlusCircleIcon />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) onFilesPicked(e.target.files)
                e.target.value = ''
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
            onChange(e.target.value)
            onTyping?.()
            requestAnimationFrame(detectTrigger)
          }}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          onClick={detectTrigger}
          onBlur={() => {
            window.scrollTo(0, 0)
          }}
        />

        {gifEnabled && onGifSelect && (
          <button
            type="button"
            onClick={() => {
              setGifOpen((p) => !p)
              setEmojiOpen(false)
            }}
            className="shrink-0 px-1.5 py-3 text-gray-400 transition hover:text-white"
            title="GIF"
            aria-label="GIF picker"
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
          className="shrink-0 pl-1.5 pr-3 py-3 text-gray-400 transition hover:text-white"
          title="Emoji"
          aria-label="Emoji picker"
        >
          <SmileIcon />
        </button>
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
          <Suspense fallback={null}>
            <GifPicker
              onSelect={(url) => {
                onGifSelect(url)
                setGifOpen(false)
              }}
              onClose={() => setGifOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {emojiOpen && (
        <div className="absolute bottom-full right-0 z-50 mb-2">
          <Suspense fallback={null}>
            <EmojiPicker
              onSelect={(emoji) => {
                onChange(value + emoji)
                setEmojiOpen(false)
                taRef.current?.focus()
              }}
              onClose={() => setEmojiOpen(false)}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
})

function MentionPopup({
  members,
  selectedIdx,
  onSelect
}: {
  members: MentionMember[]
  selectedIdx: number
  onSelect: (m: MentionMember) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-72 overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {members.map((m, i) => (
        <button
          key={m.userId}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(m)
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition ${
            i === selectedIdx ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/5'
          }`}
        >
          <UserAvatar username={m.username} avatarUrl={m.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{m.displayName ?? m.username}</span>
            {m.displayName && m.displayName !== m.username && (
              <span className="block truncate text-xs text-gray-500">@{m.username}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

function ChannelPopup({
  channels,
  selectedIdx,
  onSelect
}: {
  channels: MentionChannel[]
  selectedIdx: number
  onSelect: (c: MentionChannel) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-72 overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {channels.map((c, i) => (
        <button
          key={c.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(c)
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition ${
            i === selectedIdx ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/5'
          }`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-400">
            <HashIcon />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{c.name}</span>
            {c.serverName && <span className="block truncate text-xs text-gray-500">{c.serverName}</span>}
          </div>
        </button>
      ))}
    </div>
  )
}

function HashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  )
}

function PlusCircleIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function GifIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <text
        x="12"
        y="14.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="8"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        GIF
      </text>
    </svg>
  )
}

function SmileIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}
