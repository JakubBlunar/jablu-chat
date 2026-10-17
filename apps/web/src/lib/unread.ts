import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'

export type NotifLevel = 'all' | 'mentions' | 'none'

export type ServerBadge = { unread: boolean; mentions: number }

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
  effectiveLevel: NotifLevel
): ChannelBadge {
  if (!rs) return EMPTY_BADGE

  const showUnread = effectiveLevel !== 'none' && rs.unreadCount > 0
  const showMentions = effectiveLevel !== 'none' && rs.mentionCount > 0
  const mentionCount = showMentions ? rs.mentionCount : 0
  return { showUnread, showMentions, mentionCount, hasIndicator: showUnread || showMentions }
}

/**
 * Aggregate all server icons in one pass instead of scanning every channel
 * again for each server in the rail.
 */
export function computeServerBadges(
  channels: ReadonlyMap<string, { unreadCount: number; mentionCount: number }>,
  channelToServer: ReadonlyMap<string, string>,
  getEffective: (channelId: string, serverId?: string) => NotifLevel
): Map<string, ServerBadge> {
  const badges = new Map<string, ServerBadge>()
  for (const [channelId, serverId] of channelToServer) {
    const rs = channels.get(channelId)
    if (!rs) continue
    const badge = computeChannelBadge(rs, getEffective(channelId, serverId))
    if (!badge.hasIndicator) continue
    const serverBadge = badges.get(serverId) ?? { unread: false, mentions: 0 }
    serverBadge.unread = true
    serverBadge.mentions += badge.mentionCount
    badges.set(serverId, serverBadge)
  }
  return badges
}

/**
 * Aggregate badge for a server icon. Reads stores imperatively.
 */
export function computeServerBadge(
  serverId: string,
  getEffective: (channelId: string, serverId?: string) => NotifLevel
): ServerBadge {
  const { channels, channelToServer } = useReadStateStore.getState()
  let mentions = 0
  let unread = false
  for (const [channelId, sid] of channelToServer) {
    if (sid !== serverId) continue
    const rs = channels.get(channelId)
    if (!rs) continue
    const badge = computeChannelBadge(rs, getEffective(channelId, serverId))
    if (badge.hasIndicator) unread = true
    mentions += badge.mentionCount
  }
  return { unread, mentions }
}

/**
 * Total badge count for the page title / OS badge.
 * Numbered badges represent mentions and DMs, not ordinary channel activity.
 */
export function computeTotalBadge(): number {
  const { channels, dms, channelToServer } = useReadStateStore.getState()
  const { getEffective } = useNotifPrefStore.getState()

  let total = 0

  for (const [id, rs] of channels) {
    const serverId = channelToServer.get(id)
    const level = getEffective(id, serverId)
    const badge = computeChannelBadge(rs, level)
    total += badge.mentionCount
  }

  for (const rs of dms.values()) {
    total += rs.unreadCount
  }

  return total
}
