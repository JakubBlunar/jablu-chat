import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { RedisService } from '../redis/redis.service'

export type PushContext = {
  prisma: PrismaService
  push: PushService
  redis: RedisService
  isUserOnline: (userId: string) => boolean
}

export function describePushPreview(
  content: string | undefined,
  attachments?: { type: string }[]
): string {
  if (content?.trim()) return content.slice(0, 100)
  if (!attachments || attachments.length === 0) return '[attachment]'
  const first = attachments[0]
  const label =
    first.type === 'image' ? 'an image'
    : first.type === 'video' ? 'a video'
    : first.type === 'gif' ? 'a GIF'
    : 'a file'
  if (attachments.length === 1) return `sent ${label}`
  return `sent ${attachments.length} files`
}

export async function getChannelNotifPrefs(
  ctx: Pick<PushContext, 'prisma' | 'redis'>,
  channelId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const cacheKey = `notifprefs:${channelId}`
  try {
    const cached = await ctx.redis.client.hgetall(cacheKey)
    if (Object.keys(cached).length > 0) {
      const map = new Map<string, string>()
      for (const uid of userIds) {
        if (cached[uid]) map.set(uid, cached[uid])
      }
      return map
    }
  } catch {
    /* fall through to DB */
  }

  const prefs = await ctx.prisma.channelNotifPref.findMany({
    where: { channelId }
  })
  const map = new Map<string, string>()
  if (prefs.length > 0) {
    const hash: Record<string, string> = {}
    for (const p of prefs) {
      hash[p.userId] = p.level
      if (userIds.includes(p.userId)) map.set(p.userId, p.level)
    }
    try {
      await ctx.redis.client.hmset(cacheKey, hash)
      await ctx.redis.client.expire(cacheKey, 300)
    } catch {
      /* best-effort cache */
    }
  }
  return map
}

/**
 * Sends web-push notifications to server members who have no active
 * Socket.IO connection ("offline"). Called fire-and-forget from message
 * handlers so it never blocks the message response.
 *
 * Respects per-channel ChannelNotifPref:
 *   - "all" (default) → always push
 *   - "mentions"       → push only if user was @mentioned
 *   - "none"           → skip
 *
 * Current cost per message: 2 indexed DB queries (serverMember + channelNotifPref)
 * plus one web-push HTTP call per eligible subscription.
 *
 * --- Possible future improvements ---
 *
 * 1. Redis pref cache: store prefs in Redis (hash per channel or per user),
 *    invalidate on PUT/DELETE in NotifPrefsController. Eliminates the
 *    channelNotifPref DB query and reduces latency to a single Redis HMGET.
 *
 * 2. Bull/BullMQ job queue: instead of doing web-push calls inline,
 *    enqueue a "send-push" job. A dedicated worker processes the queue,
 *    retries on transient failures, and keeps the gateway event loop free.
 *    Pairs well with Redis since Bull already requires it.
 *
 * 3. Batch DB query: combine the serverMember + channelNotifPref lookups
 *    into a single raw SQL join to halve the DB round-trips.
 *
 * 4. User-level DND / quiet hours: check a global user preference before
 *    sending, so users can silence all push during certain time windows.
 *
 * At current scale (<20 concurrent users) the indexed queries are
 * sub-millisecond and the simple approach is appropriate.
 */
export async function sendPushToOfflineMembers(
  ctx: PushContext,
  serverId: string,
  senderId: string,
  senderName: string,
  content: string | undefined,
  url: string,
  channelId: string,
  mentionedUserIds: string[],
  attachments?: { type: string }[]
) {
  const members = await ctx.prisma.serverMember.findMany({
    where: { serverId, NOT: { userId: senderId } },
    select: { userId: true, notifLevel: true }
  })

  const offlineIds = members.filter((m) => !ctx.isUserOnline(m.userId))

  if (offlineIds.length === 0) return

  const serverPrefMap = new Map<string, string>()
  for (const m of offlineIds) {
    if (m.notifLevel) serverPrefMap.set(m.userId, m.notifLevel)
  }

  const offlineUserIds = offlineIds.map((m) => m.userId)
  const channelPrefMap = await getChannelNotifPrefs(ctx, channelId, offlineUserIds)
  const mentionSet = new Set(mentionedUserIds)

  const eligibleIds = offlineUserIds.filter((id) => {
    const channelLevel = channelPrefMap.get(id)
    const serverLevel = serverPrefMap.get(id)
    const effective = channelLevel ?? serverLevel ?? 'all'
    if (effective === 'none') return false
    if (effective === 'mentions') return mentionSet.has(id)
    return true
  })

  if (eligibleIds.length === 0) return

  const preview = describePushPreview(content, attachments)
  await ctx.push.sendToUsers(eligibleIds, {
    title: senderName,
    body: preview,
    url
  })
}
