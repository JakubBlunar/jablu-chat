import { hasPermission, messageNotificationUrl, messagePreviewText, Permission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { RedisService } from '../redis/redis.service'
import type { RolesService } from '../roles/roles.service'

export type PushContext = {
  prisma: PrismaService
  push: PushService
  redis: RedisService
  roles: RolesService
  /**
   * True when the user is already looking at the app on some device, in which
   * case push is redundant. Never "has a socket" — see `ChatGateway.isUserActivelyEngaged`.
   */
  isUserActivelyEngaged: (userId: string) => boolean
}

export function describePushPreview(
  content: string | undefined,
  attachments?: { type: string }[]
): string {
  const preview = messagePreviewText(content)
  if (preview) return preview
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
    const userIdSet = new Set(userIds)
    const hash: Record<string, string> = {}
    for (const p of prefs) {
      hash[p.userId] = p.level
      if (userIdSet.has(p.userId)) map.set(p.userId, p.level)
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
 * Sends web-push notifications to server members who are not currently looking
 * at the app on any device. Called fire-and-forget from message handlers so it
 * never blocks the message response.
 *
 * Respects per-channel ChannelNotifPref:
 *   - "all" (default) → always push
 *   - "mentions"       → push only if user was @mentioned
 *   - "none"           → skip
 *
 * Membership, preferences and permissions are resolved in batches. PushService
 * queues transport in Redis and applies push-only suppression and quiet hours.
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

  const awayMembers = members.filter((m) => !ctx.isUserActivelyEngaged(m.userId))

  if (awayMembers.length === 0) return

  const serverPrefMap = new Map<string, string>()
  for (const m of awayMembers) {
    if (m.notifLevel) serverPrefMap.set(m.userId, m.notifLevel)
  }

  const awayUserIds = awayMembers.map((m) => m.userId)
  const channelPrefMap = await getChannelNotifPrefs(ctx, channelId, awayUserIds)
  const mentionSet = new Set(mentionedUserIds)

  const prefFilteredIds = awayUserIds.filter((id) => {
    const channelLevel = channelPrefMap.get(id)
    const serverLevel = serverPrefMap.get(id)
    const effective = channelLevel ?? serverLevel ?? 'all'
    if (effective === 'none') return false
    if (effective === 'mentions') return mentionSet.has(id)
    return true
  })

  if (prefFilteredIds.length === 0) return

  const permissions = await ctx.roles.getChannelPermissionsForUsers(serverId, channelId, prefFilteredIds)
  const eligibleIds = prefFilteredIds.filter((id) =>
    hasPermission(permissions.get(id) ?? 0n, Permission.VIEW_CHANNEL)
  )

  if (eligibleIds.length === 0) return

  const preview = describePushPreview(content, attachments)
  await ctx.push.sendToUsers(eligibleIds, {
    title: senderName,
    body: preview,
    url
  })
}

/**
 * Sends push notifications to thread participants (parent author + anyone
 * who replied) when a new thread reply is posted. Respects the same
 * channel/server notification preferences as normal channel push.
 */
export async function sendPushToThreadParticipants(
  ctx: PushContext,
  parentId: string,
  channelId: string,
  serverId: string,
  senderId: string,
  senderName: string,
  content: string | undefined,
  attachments?: { type: string }[],
  messageId?: string
) {
  const [parent, replies] = await Promise.all([
    ctx.prisma.message.findUnique({
      where: { id: parentId },
      select: { authorId: true }
    }),
    ctx.prisma.message.findMany({
      where: { threadParentId: parentId, deleted: false },
      select: { authorId: true },
      distinct: ['authorId']
    })
  ])

  const participantSet = new Set<string>()
  if (parent?.authorId) participantSet.add(parent.authorId)
  for (const r of replies) {
    if (r.authorId) participantSet.add(r.authorId)
  }
  participantSet.delete(senderId)

  if (participantSet.size === 0) return

  const participantIds = [...participantSet]
  const awayIds = participantIds.filter((id) => !ctx.isUserActivelyEngaged(id))
  if (awayIds.length === 0) return

  const members = await ctx.prisma.serverMember.findMany({
    where: { serverId, userId: { in: awayIds } },
    select: { userId: true, notifLevel: true }
  })
  const serverPrefMap = new Map<string, string>()
  for (const m of members) {
    if (m.notifLevel) serverPrefMap.set(m.userId, m.notifLevel)
  }

  const memberIds = members.map((m) => m.userId)
  const channelPrefMap = await getChannelNotifPrefs(ctx, channelId, memberIds)

  const prefFilteredIds = memberIds.filter((id) => {
    const channelLevel = channelPrefMap.get(id)
    const serverLevel = serverPrefMap.get(id)
    const effective = channelLevel ?? serverLevel ?? 'all'
    return effective !== 'none'
  })

  if (prefFilteredIds.length === 0) return

  const permissions = await ctx.roles.getChannelPermissionsForUsers(serverId, channelId, prefFilteredIds)
  const eligibleIds = prefFilteredIds.filter((id) =>
    hasPermission(permissions.get(id) ?? 0n, Permission.VIEW_CHANNEL)
  )

  if (eligibleIds.length === 0) return

  const preview = describePushPreview(content, attachments)
  await ctx.push.sendToUsers(eligibleIds, {
    title: `${senderName} replied in a thread`,
    body: preview,
    url: messageId
      ? messageNotificationUrl(`/channels/${serverId}/${channelId}`, messageId, parentId)
      : `/channels/${serverId}/${channelId}`
  })
}
