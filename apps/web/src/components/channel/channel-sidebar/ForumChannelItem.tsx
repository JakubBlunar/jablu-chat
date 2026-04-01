import type { Channel } from '@chat/shared'
import React from 'react'
import { CountBadge } from '@/components/ui'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { ForumIcon, ArchiveIcon } from './sidebarIcons'
import type { ReadStateMap } from './TextChannelItem'

export function ForumChannelItem({
  ch,
  active,
  channelReadStates,
  getNotifLevel,
  longPressFired,
  currentServer,
  orchestratedGoToChannel,
  handleChannelTouchStart,
  handleChannelTouchEnd,
  handleChannelTouchMove,
  handleChannelContextMenu,
  compact = false
}: {
  ch: Channel
  active: boolean
  channelReadStates: ReadStateMap
  getNotifLevel: (channelId: string) => string
  longPressFired: React.MutableRefObject<boolean>
  currentServer: { id: string } | null
  orchestratedGoToChannel: (serverId: string, channelId: string) => Promise<unknown>
  handleChannelTouchStart: (ch: Channel) => void
  handleChannelTouchEnd: () => void
  handleChannelTouchMove: () => void
  handleChannelContextMenu: (e: React.MouseEvent) => void
  compact?: boolean
}) {
  const rs = channelReadStates.get(ch.id)
  const level = getNotifLevel(ch.id)
  const showUnreadDot = level === 'all' && !active && rs != null && rs.unreadCount > 0
  const showMentions = level !== 'none' && !active && (rs?.mentionCount ?? 0) > 0
  const mentionCount = showMentions ? rs!.mentionCount : 0
  const hasIndicator = showUnreadDot || showMentions
  const isArchived = !!ch.isArchived
  return (
    <li>
      <button
        type="button"
        onClick={(e) => {
          if (longPressFired.current) {
            e.preventDefault()
            e.stopPropagation()
            longPressFired.current = false
            return
          }
          if (currentServer) void orchestratedGoToChannel(currentServer.id, ch.id)
          useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
        }}
        onTouchStart={() => handleChannelTouchStart(ch)}
        onTouchEnd={handleChannelTouchEnd}
        onTouchMove={handleChannelTouchMove}
        onContextMenu={handleChannelContextMenu}
        className={`flex w-full items-center gap-2 rounded-md px-2 ${compact ? 'py-2 text-sm' : 'py-1.5 text-[15px]'} text-left transition ${
          isArchived
            ? active
              ? 'bg-surface-selected text-gray-400'
              : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-400'
            : active
              ? 'bg-surface-selected text-white'
              : hasIndicator
                ? 'font-semibold text-white hover:bg-white/[0.06]'
                : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        {isArchived ? <ArchiveIcon /> : <ForumIcon />}
        <span className="min-w-0 flex-1 truncate">{ch.name}</span>
        {mentionCount > 0 && <CountBadge count={mentionCount} variant="danger" max={10} />}
        {showUnreadDot && mentionCount === 0 && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
      </button>
    </li>
  )
}
