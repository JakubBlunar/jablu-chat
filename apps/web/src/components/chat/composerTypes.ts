import type { BotCommandWithBot } from '@chat/shared'
export type CustomEmojiItem = {
  id: string
  name: string
  imageUrl: string
}

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
  onFilesPicked?: (files: File[]) => void
  onPaste?: (e: React.ClipboardEvent) => void
  placeholder: string
  disabled?: boolean
  hasAttachments?: boolean
  members?: MentionMember[]
  channels?: MentionChannel[]
  gifEnabled?: boolean
  onGifSelect?: (url: string) => void
  onCommand?: (command: string) => void
  botCommands?: BotCommandWithBot[]
  onBotCommandPick?: (info: { botAppId: string; commandName: string } | null) => void
  customEmojis?: CustomEmojiItem[]
  onEditLastMessage?: () => void
}

export type PopupMode = 'none' | 'mention' | 'channel' | 'command' | 'emoji'

export type CommandItem = {
  key: string
  name: string
  description: string
  tag?: string
  botAppId?: string
  botUser?: { username: string; avatarUrl: string | null }
}

export type BuiltinCommandItem = {
  key: string
  name: string
  descriptionKey: 'poll' | 'shrug' | 'tableflip' | 'unflip' | 'lenny' | 'spoiler' | 'me' | 'nick'
  tagKey: 'tools' | 'fun' | 'formatting' | 'settings'
}
