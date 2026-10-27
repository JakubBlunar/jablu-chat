import type { BotCommandWithBot } from '@chat/shared'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { applyComposerCompletion, findComposerTrigger } from '../composerCompletion'
import type {
  BuiltinCommandItem,
  ChatInputBarProps,
  CommandItem,
  CustomEmojiItem,
  MentionChannel,
  MentionMember,
  PopupMode
} from '../composerTypes'
const BUILTIN_COMMANDS: BuiltinCommandItem[] = [
  { key: 'b:poll', name: 'poll', descriptionKey: 'poll', tagKey: 'tools' },
  { key: 'b:shrug', name: 'shrug', descriptionKey: 'shrug', tagKey: 'fun' },
  { key: 'b:tableflip', name: 'tableflip', descriptionKey: 'tableflip', tagKey: 'fun' },
  { key: 'b:unflip', name: 'unflip', descriptionKey: 'unflip', tagKey: 'fun' },
  { key: 'b:lenny', name: 'lenny', descriptionKey: 'lenny', tagKey: 'fun' },
  { key: 'b:spoiler', name: 'spoiler', descriptionKey: 'spoiler', tagKey: 'formatting' },
  { key: 'b:me', name: 'me', descriptionKey: 'me', tagKey: 'formatting' },
  { key: 'b:nick', name: 'nick', descriptionKey: 'nick', tagKey: 'settings' }
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
export function useComposerSuggestions({
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
}: Pick<
  ChatInputBarProps,
  'value' | 'onChange' | 'members' | 'channels' | 'onCommand' | 'botCommands' | 'onBotCommandPick' | 'customEmojis'
> & { taRef: RefObject<HTMLTextAreaElement | null>; wrapperRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation('chat')
  const [popupMode, setPopupMode] = useState<PopupMode>('none')
  const [query, setQuery] = useState('')
  const [triggerStart, setTriggerStart] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const dismissed = useRef<{ value: string; cursor: number } | null>(null)
  const dismissSuggestions = useCallback(() => {
    const element = taRef.current
    dismissed.current = element ? { value: element.value, cursor: element.selectionStart } : null
    setPopupMode('none')
  }, [taRef])

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
    const roleEntries = members.filter((m) => m.userId.startsWith('__role__:'))
    const userEntries = members.filter((m) => !m.userId.startsWith('__role__:'))
    const roleResults = roleEntries.filter((m) => m.username.toLowerCase().includes(q)).slice(0, 6)
    const userResults = userEntries
      .filter((m) => m.username.toLowerCase().includes(q) || (m.displayName && m.displayName.toLowerCase().includes(q)))
      .slice(0, Math.max(0, 10 - broadcastEntries.length - roleResults.length))
    return [...broadcastEntries, ...roleResults, ...userResults]
  }, [popupMode, query, members])

  const filteredChannels = useMemo(() => {
    if (popupMode !== 'channel' || !channels) return []
    const q = query.toLowerCase()
    return channels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10)
  }, [popupMode, query, channels])

  const builtinCommandItems = useMemo(
    () =>
      BUILTIN_COMMANDS.map(({ descriptionKey, tagKey, ...command }) => ({
        ...command,
        description: t(`builtinCommandDescription.${descriptionKey}`),
        tag: t(`builtinCommandCategory.${tagKey}`)
      })),
    [t]
  )

  const botCommandItems = useMemo(() => botToCommandItems(botCommands ?? []), [botCommands])

  const filteredCommands = useMemo(() => {
    if (popupMode !== 'command') return []
    const q = query.toLowerCase()
    const builtIn = builtinCommandItems.filter((c) => c.name.startsWith(q))
    const bots = botCommandItems.filter((c) => c.name.toLowerCase().startsWith(q))
    return [...builtIn, ...bots]
  }, [popupMode, query, builtinCommandItems, botCommandItems])

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
        dismissSuggestions()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [popupOpen, wrapperRef, dismissSuggestions])

  const detectTrigger = useCallback(() => {
    const el = taRef.current
    if (el && dismissed.current?.value === el.value && dismissed.current.cursor === el.selectionStart) return
    dismissed.current = null
    const trigger = el
      ? findComposerTrigger(el.value, el.selectionStart, {
          mentions: !!members?.length,
          channels: !!channels?.length,
          commands: !!onCommand,
          emojis: !!customEmojis?.length
        })
      : null
    setPopupMode(trigger?.mode ?? 'none')
    if (trigger) {
      setQuery(trigger.query)
      setTriggerStart(trigger.start)
      setSelectedIdx(0)
    }
  }, [members, channels, onCommand, customEmojis, taRef])

  const insertMention = useCallback(
    (member: MentionMember) => {
      const el = taRef.current
      if (!el) return
      let insert: string
      if (member.userId === '__everyone__') {
        insert = '@everyone '
      } else if (member.userId === '__here__') {
        insert = '@here '
      } else if (member.userId.startsWith('__role__:')) {
        const rawName = member.username
        if (/^\w+$/.test(rawName)) {
          insert = `@${rawName} `
        } else {
          const safe = rawName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          insert = `@"${safe}" `
        }
      } else {
        insert = `@${member.username} `
      }
      const next = applyComposerCompletion(value, triggerStart, el.selectionStart, insert)
      onChange(next.value)
      setPopupMode('none')
      requestAnimationFrame(() => {
        const cursor = next.cursor
        el.setSelectionRange(cursor, cursor)
        el.focus()
      })
    },
    [value, triggerStart, onChange, taRef]
  )

  const insertChannel = useCallback(
    (channel: MentionChannel) => {
      const el = taRef.current
      if (!el) return
      const insert = `#${channel.name} `
      const next = applyComposerCompletion(value, triggerStart, el.selectionStart, insert)
      onChange(next.value)
      setPopupMode('none')
      requestAnimationFrame(() => {
        const cursor = next.cursor
        el.setSelectionRange(cursor, cursor)
        el.focus()
      })
    },
    [value, triggerStart, onChange, taRef]
  )

  const insertEmoji = useCallback(
    (emoji: CustomEmojiItem) => {
      const el = taRef.current
      if (!el) return
      const insert = `:${emoji.name}: `
      const next = applyComposerCompletion(value, triggerStart, el.selectionStart, insert)
      onChange(next.value)
      setPopupMode('none')
      requestAnimationFrame(() => {
        const cursor = next.cursor
        el.setSelectionRange(cursor, cursor)
        el.focus()
      })
    },
    [value, triggerStart, onChange, taRef]
  )

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
    [onChange, onBotCommandPick, taRef]
  )
  const handleSuggestionKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        dismissSuggestions()
        if (popupOpen) e.preventDefault()
        return popupOpen
      }
      if (popupOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIdx((i) => (i + 1) % popupLength)
          return true
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIdx((i) => (i - 1 + popupLength) % popupLength)
          return true
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
          return true
        }
      }
      return false
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
      dismissSuggestions
    ]
  )
  return {
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
  }
}
