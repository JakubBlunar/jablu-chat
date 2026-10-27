import { useTranslation } from 'react-i18next'
import { UserAvatar } from '@/components/UserAvatar'
import { resolveMediaUrl } from '@/lib/api'
import { HashIcon, SlashIcon } from './chatIcons'
import { SuggestionList } from './SuggestionList'
import type { MentionMember, MentionChannel, CommandItem, CustomEmojiItem } from './composerTypes'
export function MentionPopup({
  members,
  selectedIdx,
  onSelect
}: {
  members: MentionMember[]
  selectedIdx: number
  onSelect: (m: MentionMember) => void
}) {
  const { t } = useTranslation('chat')
  return (
    <SuggestionList
      items={members}
      getKey={(m) => m.userId}
      selectedIndex={selectedIdx}
      onSelect={onSelect}
      label={t('mentionSuggestions')}
      renderItem={(m) => {
        const isBroadcast = m.userId === '__everyone__' || m.userId === '__here__'
        const isRole = m.userId.startsWith('__role__:')
        return (
          <>
            {isBroadcast ? (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-500/20">
                <span className="text-xs text-yellow-300">@</span>
              </div>
            ) : isRole ? (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/25">
                <span className="text-[10px] font-semibold text-indigo-200">R</span>
              </div>
            ) : (
              <UserAvatar username={m.username} avatarUrl={m.avatarUrl} size="sm" />
            )}
            <div className="min-w-0 flex-1">
              <span
                className={`block truncate text-sm font-medium ${
                  isBroadcast ? 'text-yellow-300' : isRole ? 'text-indigo-200' : ''
                }`}
              >
                @{m.username}
              </span>
              {isBroadcast && (
                <span className="block truncate text-xs text-gray-500">
                  {m.userId === '__everyone__' ? t('mention.notifyEveryone') : t('mention.notifyOnline')}
                </span>
              )}
              {isRole && <span className="block truncate text-xs text-gray-500">{t('mention.notifyRole')}</span>}
              {!isBroadcast && !isRole && m.displayName && m.displayName !== m.username && (
                <span className="block truncate text-xs text-gray-500">@{m.username}</span>
              )}
            </div>
          </>
        )
      }}
    />
  )
}
export function ChannelPopup({
  channels,
  selectedIdx,
  onSelect
}: {
  channels: MentionChannel[]
  selectedIdx: number
  onSelect: (c: MentionChannel) => void
}) {
  const { t } = useTranslation('chat')
  return (
    <SuggestionList
      items={channels}
      getKey={(c) => c.id}
      selectedIndex={selectedIdx}
      onSelect={onSelect}
      label={t('channelSuggestions')}
      renderItem={(c) => {
        return (
          <>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-400">
              <HashIcon />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              {c.serverName && <span className="block truncate text-xs text-gray-500">{c.serverName}</span>}
            </div>
          </>
        )
      }}
    />
  )
}
export function CommandPopup({
  commands,
  selectedIdx,
  onSelect
}: {
  commands: CommandItem[]
  selectedIdx: number
  onSelect: (c: CommandItem) => void
}) {
  const { t } = useTranslation('chat')
  return (
    <SuggestionList
      items={commands}
      getKey={(c) => c.key}
      selectedIndex={selectedIdx}
      onSelect={onSelect}
      label={t('commandSuggestions')}
      size="wide"
      renderItem={(c) => {
        return (
          <>
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
          </>
        )
      }}
    />
  )
}
export function CustomEmojiPopup({
  emojis,
  selectedIdx,
  onSelect
}: {
  emojis: CustomEmojiItem[]
  selectedIdx: number
  onSelect: (e: CustomEmojiItem) => void
}) {
  const { t } = useTranslation('chat')
  return (
    <SuggestionList
      items={emojis}
      getKey={(e) => e.id}
      selectedIndex={selectedIdx}
      onSelect={onSelect}
      label={t('customEmojiSuggestions')}
      renderItem={(e) => {
        return (
          <>
            <img
              src={resolveMediaUrl(e.imageUrl)}
              alt={e.name}
              className="h-6 w-6 shrink-0 object-contain"
              loading="lazy"
            />
            <span className="truncate text-sm">:{e.name}:</span>
          </>
        )
      }}
    />
  )
}
