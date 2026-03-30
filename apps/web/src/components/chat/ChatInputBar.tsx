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
import { MAX_MESSAGE_LENGTH } from '@chat/shared'
import { useIsMobile } from '@/hooks/useMobile'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
const GifPicker = lazy(() => import('@/components/GifPicker').then((m) => ({ default: m.GifPicker })))
import { UserAvatar } from '@/components/UserAvatar'

const MAX_TEXTAREA_PX = 240
const MIN_TEXTAREA_PX = 44
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
  onCommand?: (command: string) => void
}

type PopupMode = 'none' | 'mention' | 'channel' | 'command'

type SlashCommand = { name: string; description: string }

const COMMANDS: SlashCommand[] = [
  { name: 'poll', description: 'Create a poll' }
]

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
    onGifSelect,
    onCommand
  },
  ref
) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus()
  }))
  const fileRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)

  const wrapSelection = useCallback((prefix: string, suffix: string) => {
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
  }, [value, onChange])

  const [popupMode, setPopupMode] = useState<PopupMode>('none')
  const [query, setQuery] = useState('')
  const [triggerStart, setTriggerStart] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const filteredMembers = useMemo(() => {
    if (popupMode !== 'mention' || !members) return []
    const q = query.toLowerCase()
    const broadcastEntries: MentionMember[] = []
    if ('everyone'.startsWith(q)) {
      broadcastEntries.push({ userId: '__everyone__', username: 'everyone', displayName: 'everyone', avatarUrl: null })
    }
    if ('here'.startsWith(q)) {
      broadcastEntries.push({ userId: '__here__', username: 'here', displayName: 'here', avatarUrl: null })
    }
    const memberResults = members
      .filter((m) => m.username.toLowerCase().includes(q) || (m.displayName && m.displayName.toLowerCase().includes(q)))
      .slice(0, 10 - broadcastEntries.length)
    return [...broadcastEntries, ...memberResults]
  }, [popupMode, query, members])

  const filteredChannels = useMemo(() => {
    if (popupMode !== 'channel' || !channels) return []
    const q = query.toLowerCase()
    return channels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10)
  }, [popupMode, query, channels])

  const filteredCommands = useMemo(() => {
    if (popupMode !== 'command') return []
    const q = query.toLowerCase()
    return COMMANDS.filter((c) => c.name.startsWith(q))
  }, [popupMode, query])

  const popupOpen =
    (popupMode === 'mention' && filteredMembers.length > 0) ||
    (popupMode === 'channel' && filteredChannels.length > 0) ||
    (popupMode === 'command' && filteredCommands.length > 0)

  const popupLength =
    popupMode === 'mention'
      ? filteredMembers.length
      : popupMode === 'channel'
        ? filteredChannels.length
        : filteredCommands.length

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
    const slashIdx = text.lastIndexOf('/')

    const bestIdx = Math.max(atIdx, hashIdx, slashIdx)
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
    if (trigger === '/' && onCommand) {
      setPopupMode('command')
      setQuery(fragment)
      setTriggerStart(bestIdx)
      setSelectedIdx(0)
    } else if (trigger === '@' && members?.length) {
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
  }, [members, channels, onCommand])

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

  useEffect(() => {
    detectTrigger()
  }, [value, detectTrigger])

  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      onChange('')
      setPopupMode('none')
      onCommand?.(cmd.name)
      requestAnimationFrame(() => taRef.current?.focus())
    },
    [onChange, onCommand]
  )

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
          } else if (popupMode === 'command' && filteredCommands[selectedIdx]) {
            executeCommand(filteredCommands[selectedIdx])
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
    [
      popupOpen,
      popupMode,
      popupLength,
      filteredMembers,
      filteredChannels,
      filteredCommands,
      selectedIdx,
      insertMention,
      insertChannel,
      executeCommand,
      onSend,
      value,
      wrapSelection
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
      {popupOpen && popupMode === 'command' && (
        <CommandPopup commands={filteredCommands} selectedIdx={selectedIdx} onSelect={executeCommand} />
      )}

      {showToolbar && !isMobile && (
        <div className="flex items-center gap-0.5 border-b border-white/5 px-2 py-1">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('**', '**')} className="rounded p-1 text-xs font-bold text-gray-400 transition hover:bg-white/10 hover:text-white" title="Bold (Ctrl+B)">B</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('*', '*')} className="rounded p-1 text-xs italic text-gray-400 transition hover:bg-white/10 hover:text-white" title="Italic (Ctrl+I)">I</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('~~', '~~')} className="rounded p-1 text-xs text-gray-400 line-through transition hover:bg-white/10 hover:text-white" title="Strikethrough">S</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('`', '`')} className="rounded p-1 font-mono text-xs text-gray-400 transition hover:bg-white/10 hover:text-white" title="Inline code">{'\u{60}'}</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('```\n', '\n```')} className="rounded p-1 font-mono text-xs text-gray-400 transition hover:bg-white/10 hover:text-white" title="Code block">{'\u{60}\u{60}\u{60}'}</button>
        </div>
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
          enterKeyHint={isMobile ? 'send' : undefined}
          className="max-h-[240px] min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] leading-snug text-gray-100 outline-none placeholder:text-gray-500 disabled:opacity-50"
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

        {value.trim().length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (value.length <= MAX_MESSAGE_LENGTH) onSend()
            }}
            className={`shrink-0 text-primary transition hover:text-primary-hover ${isMobile ? 'px-2.5 py-3' : 'pr-3 py-3'}`}
            aria-label="Send message"
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
      {members.map((m, i) => {
        const isBroadcast = m.userId === '__everyone__' || m.userId === '__here__'
        return (
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
            {isBroadcast ? (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-500/20">
                <span className="text-xs text-yellow-300">@</span>
              </div>
            ) : (
              <UserAvatar username={m.username} avatarUrl={m.avatarUrl} size="sm" />
            )}
            <div className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-medium ${isBroadcast ? 'text-yellow-300' : ''}`}>
                @{m.username}
              </span>
              {isBroadcast && (
                <span className="block truncate text-xs text-gray-500">
                  {m.userId === '__everyone__' ? 'Notify all members' : 'Notify online members'}
                </span>
              )}
              {!isBroadcast && m.displayName && m.displayName !== m.username && (
                <span className="block truncate text-xs text-gray-500">@{m.username}</span>
              )}
            </div>
          </button>
        )
      })}
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

function CommandPopup({
  commands,
  selectedIdx,
  onSelect
}: {
  commands: SlashCommand[]
  selectedIdx: number
  onSelect: (c: SlashCommand) => void
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
      {commands.map((c, i) => (
        <button
          key={c.name}
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
            <SlashIcon />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">/{c.name}</span>
            <span className="block truncate text-xs text-gray-500">{c.description}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function SlashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="7" y1="20" x2="17" y2="4" />
    </svg>
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
