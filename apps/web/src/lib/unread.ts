import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'

export type NotifLevel = 'all' | 'mentions' | 'none'

export type ChannelBadge = {
  showUnread: boolean
  showMentions: boolean
  mentionCount: number
  hasIndicator: boolean
}

const EMPTY_BADGE: ChannelBadge = { showUnread: false, showMentions: false, mentionCount: 0, hasIndicator: false }

/**
 * Single source of truth for per-channel unread badge logic.
 * Pure function — no store access; caller resolves inputs.
 */
export function computeChannelBadge(
  rs: { unreadCount: number; mentionCount: number } | undefined,
  effectiveLevel: NotifLevel,
  isActive: boolean
): ChannelBadge {
  if (isActive || !rs) return EMPTY_BADGE

  const showUnread = effectiveLevel === 'all' && rs.unreadCount > 0
  const showMentions = effectiveLevel !== 'none' && rs.mentionCount > 0
  const mentionCount = showMentions ? rs.mentionCount : 0
  return { showUnread, showMentions, mentionCount, hasIndicator: showUnread || showMentions }
}

/**
 * Aggregate badge for a server icon. Reads stores imperatively.
 */
export function computeServerBadge(
  serverId: string,
  getEffective: (channelId: string, serverId?: string) => NotifLevel
): { unread: boolean; mentions: number } {
  const { channels, channelToServer } = useReadStateStore.getState()
  let mentions = 0
  let unread = false
  for (const [channelId, sid] of channelToServer) {
    if (sid !== serverId) continue
    const rs = channels.get(channelId)
    if (!rs) continue
    const badge = computeChannelBadge(rs, getEffective(channelId, serverId), false)
    if (badge.hasIndicator) unread = true
    mentions += badge.mentionCount
  }
  return { unread, mentions }
}

/**
 * Total badge count for the page title / OS badge.
 * Respects notification preferences and excludes the active channel/DM.
 */
export function computeTotalBadge(): number {
  const { channels, dms, channelToServer } = useReadStateStore.getState()
  const { getEffective } = useNotifPrefStore.getState()
  const viewMode = useServerStore.getState().viewMode
  const activeChannelId = useChannelStore.getState().currentChannelId
  const activeConvId = useDmStore.getState().currentConversationId

  let total = 0

  for (const [id, rs] of channels) {
    const isActive = viewMode === 'server' && id === activeChannelId
    const serverId = channelToServer.get(id)
    const level = getEffective(id, serverId)
    const badge = computeChannelBadge(rs, level, isActive)
    if (badge.showUnread) total += rs.unreadCount
    else if (badge.showMentions) total += badge.mentionCount
  }

  for (const [id, rs] of dms) {
    if (viewMode === 'dm' && id === activeConvId) continue
    total += rs.unreadCount
  }

  return total
}
