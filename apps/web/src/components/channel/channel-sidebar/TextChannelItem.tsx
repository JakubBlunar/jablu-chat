import type { Channel } from '@chat/shared'
import React, { memo } from 'react'
import { CountBadge } from '@/components/ui'
import { computeChannelBadge, type NotifLevel } from '@/lib/unread'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { ArchiveIcon, HashIcon } from './sidebarIcons'

export type ChannelItemReadState = { unreadCount: number; mentionCount: number }

export const TextChannelItem = memo(function TextChannelItem({
  ch,
  active,
  readState,
  notifLevel,
  longPressFired,
  currentServer,
  orchestratedGoToChannel,
  handleChannelTouchStart,
  handleChannelTouchEnd,
  handleChannelTouchMove,
  handleChannelContextMenu
}: {
  ch: Channel
  active: boolean
  readState: ChannelItemReadState | undefined
  notifLevel: NotifLevel
  longPressFired: React.MutableRefObject<boolean>
  currentServer: { id: string } | null
  orchestratedGoToChannel: (serverId: string, channelId: string) => Promise<unknown>
  handleChannelTouchStart: (ch: Channel) => void
  handleChannelTouchEnd: () => void
  handleChannelTouchMove: () => void
  handleChannelContextMenu: (e: React.MouseEvent) => void
}) {
  const badge = computeChannelBadge(readState, notifLevel)
  const { showUnread: showUnreadDot, mentionCount, hasIndicator } = badge
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
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] transition ${
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
        {isArchived ? <ArchiveIcon /> : <HashIcon />}
        <span className="min-w-0 flex-1 truncate">{ch.name}</span>
        {mentionCount > 0 && <CountBadge count={mentionCount} variant="danger" max={10} />}
        {showUnreadDot && mentionCount === 0 && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
      </button>
    </li>
  )
})
