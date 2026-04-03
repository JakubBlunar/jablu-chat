import type { BotCommandWithBot } from '@chat/shared'
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
import { resolveMediaUrl } from '@/lib/api'
import {
  EyeSlashIcon,
  GifIcon,
  HashIcon,
  PlusCircleIcon,
  SlashIcon,
  SmileIcon,
} from '@/components/chat/chatIcons'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
const GifPicker = lazy(() => import('@/components/GifPicker').then((m) => ({ default: m.GifPicker })))
import { UserAvatar } from '@/components/UserAvatar'

export type CustomEmojiItem = {
  id: string
  name: string
  imageUrl: string
}

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
  botCommands?: BotCommandWithBot[]
  onBotCommandPick?: (info: { botAppId: string; commandName: string } | null) => void
  customEmojis?: CustomEmojiItem[]
}

type PopupMode = 'none' | 'mention' | 'channel' | 'command' | 'emoji'

type CommandItem = {
  key: string
  name: string
  description: string
  tag?: string
  botAppId?: string
  botUser?: { username: string; avatarUrl: string | null }
}

const BUILTIN_COMMANDS: CommandItem[] = [
  { key: 'b:poll', name: 'poll', description: 'Create a poll', tag: 'Tools' },
  { key: 'b:shrug', name: 'shrug', description: 'Append ¯\\_(ツ)_/¯ to your message', tag: 'Fun' },
  { key: 'b:tableflip', name: 'tableflip', description: 'Send (╯°□°)╯︵ ┻━┻', tag: 'Fun' },
  { key: 'b:unflip', name: 'unflip', description: 'Send ┬─┬ ノ( ゜-゜ノ)', tag: 'Fun' },
  { key: 'b:lenny', name: 'lenny', description: 'Append ( ͡° ͜ʖ ͡°) to your message', tag: 'Fun' },
  { key: 'b:spoiler', name: 'spoiler', description: 'Wrap your text in a spoiler ||text||', tag: 'Formatting' },
  { key: 'b:me', name: 'me', description: 'Send an action message in italics', tag: 'Formatting' },
  { key: 'b:nick', name: 'nick', description: 'Change your server display name', tag: 'Settings' },
]

function botToCommandItems(bots: BotCommandWithBot[]): CommandItem[] {
  return bots.map((cmd) => {
    const u = cmd.bot.user
    return {
      key: `bot:${cmd.id}`,
      name: cmd.name,
      description: cmd.description,
      tag: u.displayName?.trim() || u.username,
      botAppId: cmd.botAppId,
      botUser: u
    }
  })
}

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
    members,
    channels,
    gifEnabled,
    onGifSelect,
    onCommand,
    botCommands,
    onBotCommandPick,
    customEmojis
  },
  ref
) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

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

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    dismissPopup: () => setPopupMode('none')
  }))

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

  const botCommandItems = useMemo(() => botToCommandItems(botCommands ?? []), [botCommands])

  const filteredCommands = useMemo(() => {
    if (popupMode !== 'command') return []
    const q = query.toLowerCase()
    const builtIn = BUILTIN_COMMANDS.filter((c) => c.name.startsWith(q))
    const bots = botCommandItems.filter((c) => c.name.toLowerCase().startsWith(q))
    return [...builtIn, ...bots]
  }, [popupMode, query, botCommandItems])

  const filteredEmojis = useMemo(() => {
    if (popupMode !== 'emoji' || !customEmojis?.length) return []
    const q = query.toLowerCase()
    return customEmojis.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 10)
  }, [popupMode, query, customEmojis])

  const popupOpen =
    (popupMode === 'mention' && filteredMembers.length > 0) ||
    (popupMode === 'channel' && filteredChannels.length > 0) ||
    (popupMode === 'command' && filteredCommands.length > 0) ||
    (popupMode === 'emoji' && filteredEmojis.length > 0)

  const popupLength =
    popupMode === 'mention'
      ? filteredMembers.length
      : popupMode === 'channel'
        ? filteredChannels.length
        : popupMode === 'emoji'
          ? filteredEmojis.length
          : filteredCommands.length

  useEffect(() => {
    if (!popupOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPopupMode('none')
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [popupOpen])

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

    if (customEmojis?.length) {
      const colonIdx = text.lastIndexOf(':')
      if (colonIdx !== -1 && colonIdx >= bestIdx) {
        const emojiFragment = text.slice(colonIdx + 1)
        if (emojiFragment.length >= 1 && !/[\s:]/.test(emojiFragment)) {
          setPopupMode('emoji')
          setQuery(emojiFragment)
          setTriggerStart(colonIdx)
          setSelectedIdx(0)
          return
        }
      }
    }

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
  }, [members, channels, onCommand, customEmojis])

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

  const insertEmoji = useCallback(
    (emoji: CustomEmojiItem) => {
      const el = taRef.current
      if (!el) return
      const before = value.slice(0, triggerStart)
      const after = value.slice(el.selectionStart)
      const insert = `:${emoji.name}: `
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
    (cmd: CommandItem) => {
      onChange(`/${cmd.name} `)
      onBotCommandPick?.(cmd.botAppId ? { botAppId: cmd.botAppId, commandName: cmd.name } : null)
      setPopupMode('none')
      requestAnimationFrame(() => taRef.current?.focus())
    },
    [onChange, onBotCommandPick]
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
          } else if (popupMode === 'emoji' && filteredEmojis[selectedIdx]) {
            insertEmoji(filteredEmojis[selectedIdx])
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
      filteredEmojis,
      selectedIdx,
      insertMention,
      insertChannel,
      insertEmoji,
      executeCommand,
      onSend,
      value,
      wrapSelection
    ]
  )

  return (
    <div ref={wrapperRef} className="relative rounded-lg bg-surface-raised ring-1 ring-black/20 transition focus-within:ring-primary/60">
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
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('**', '**')} className="rounded p-1 text-xs font-bold text-gray-400 transition hover:bg-white/10 hover:text-white" title="Bold (Ctrl+B)">B</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('*', '*')} className="rounded p-1 text-xs italic text-gray-400 transition hover:bg-white/10 hover:text-white" title="Italic (Ctrl+I)">I</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('~~', '~~')} className="rounded p-1 text-xs text-gray-400 line-through transition hover:bg-white/10 hover:text-white" title="Strikethrough">S</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('||', '||')} className="rounded p-1 text-xs text-gray-400 transition hover:bg-white/10 hover:text-white" title="Spoiler"><EyeSlashIcon /></button>
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
          <SmileIcon className="h-5 w-5" />
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
              customEmojis={customEmojis}
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
      role="listbox"
      aria-label="Mentions"
      className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-72 overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {members.map((m, i) => {
        const isBroadcast = m.userId === '__everyone__' || m.userId === '__here__'
        return (
          <button
            key={m.userId}
            type="button"
            role="option"
            aria-selected={i === selectedIdx}
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
      role="listbox"
      aria-label="Channels"
      className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-72 overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {channels.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={i === selectedIdx}
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
  commands: CommandItem[]
  selectedIdx: number
  onSelect: (c: CommandItem) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Commands"
      className="absolute bottom-full left-0 z-50 mb-1 max-h-64 w-80 overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {commands.map((c, i) => (
        <button
          key={c.key}
          type="button"
          role="option"
          aria-selected={i === selectedIdx}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(c)
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition ${
            i === selectedIdx ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/5'
          }`}
        >
          {c.botUser ? (
            <UserAvatar username={c.botUser.username} avatarUrl={c.botUser.avatarUrl} size="sm" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-400">
              <SlashIcon />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">/{c.name}</span>
            <span className="block truncate text-xs text-gray-500">{c.description}</span>
          </div>
          {c.tag && (
            <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">{c.tag}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function CustomEmojiPopup({
  emojis,
  selectedIdx,
  onSelect
}: {
  emojis: CustomEmojiItem[]
  selectedIdx: number
  onSelect: (e: CustomEmojiItem) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Custom Emoji"
      className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-72 overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {emojis.map((e, i) => (
        <button
          key={e.id}
          type="button"
          role="option"
          aria-selected={i === selectedIdx}
          onMouseDown={(ev) => {
            ev.preventDefault()
            onSelect(e)
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition ${
            i === selectedIdx ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/5'
          }`}
        >
          <img
            src={resolveMediaUrl(e.imageUrl)}
            alt={e.name}
            className="h-6 w-6 shrink-0 object-contain"
            loading="lazy"
          />
          <span className="truncate text-sm">:{e.name}:</span>
        </button>
      ))}
    </div>
  )
}
