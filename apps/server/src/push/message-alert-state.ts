import { hasPermission, Permission, type NotificationTarget } from '@chat/shared'
import type { PrismaService } from '../prisma/prisma.service'
import type { RolesService } from '../roles/roles.service'

/** Recheck a queued or displayed message alert against the current conversation. */
export async function unreadMessageAlert(
  prisma: PrismaService,
  roles: RolesService,
  target: NotificationTarget,
  userIds: string[],
  directed?: string[]
): Promise<{ createdAt: Date; userIds: string[] } | null> {
  const message = await prisma.message.findUnique({
    where: { id: target.messageId },
    select: {
      createdAt: true, deleted: true, authorId: true, directConversationId: true,
      channelId: true, threadParentId: true, channel: { select: { serverId: true } }
    }
  })
  if (!message || message.deleted) return null
  const candidates = userIds.filter((id) => id !== message.authorId)
  if (candidates.length === 0) return { createdAt: message.createdAt, userIds: [] }
  const explicitlySeen = async () => {
    const rows = await prisma.inAppNotification.findMany({
      where: {
        userId: { in: candidates }, readAt: { not: null },
        kind: { in: ['mention', 'reply', 'thread_reply', 'channel_message', 'dm_message'] },
        payload: { path: ['messageId'], equals: target.messageId }
      },
      select: { userId: true }
    })
    return new Set(rows.map(({ userId }) => userId))
  }
  if (target.mode === 'dm') {
    if (message.directConversationId !== target.contextId) return null
    const [members, states, seen] = await Promise.all([
      prisma.directConversationMember.findMany({
        where: { conversationId: target.contextId, userId: { in: candidates }, muted: false },
        select: { userId: true, joinedAt: true }
      }),
      prisma.dmReadState.findMany({
        where: { conversationId: target.contextId, userId: { in: candidates } },
        select: { userId: true, lastReadAt: true }
      }),
      explicitlySeen()
    ])
    const readAt = new Map(states.map((state) => [state.userId, state.lastReadAt]))
    return {
      createdAt: message.createdAt,
      userIds: members.filter((member) => !seen.has(member.userId) &&
        (readAt.get(member.userId) ?? member.joinedAt) < message.createdAt).map((member) => member.userId)
    }
  }
  if (message.channelId !== target.contextId || message.channel?.serverId !== target.serverId ||
    message.threadParentId !== target.threadParentId || !target.serverId) return null
  const [members, overrides, permissions, rootStates, threadStates, seen] = await Promise.all([
    prisma.serverMember.findMany({
      where: { serverId: target.serverId, userId: { in: candidates } },
      select: { userId: true, joinedAt: true, notifLevel: true }
    }),
    prisma.channelNotifPref.findMany({
      where: { channelId: target.contextId, userId: { in: candidates } },
      select: { userId: true, level: true }
    }),
    roles.getChannelPermissionsForUsers(target.serverId, target.contextId, candidates),
    prisma.channelReadState.findMany({
      where: { channelId: target.contextId, userId: { in: candidates } },
      select: { userId: true, lastReadAt: true }
    }),
    target.threadParentId ? prisma.inboxThreadReadState.findMany({
      where: { threadParentId: target.threadParentId, userId: { in: candidates } },
      select: { userId: true, lastReadAt: true }
    }) : [],
    explicitlySeen()
  ])
  const readAt = new Map([...rootStates, ...threadStates].map((state) => [state.userId, state.lastReadAt]))
  const levels = new Map(overrides.map(({ userId, level }) => [userId, level]))
  const directedIds = directed && new Set(directed)
  return {
    createdAt: message.createdAt,
    userIds: members.filter(({ userId, joinedAt, notifLevel }) => {
      const level = levels.get(userId) ?? notifLevel
      return !seen.has(userId) && hasPermission(permissions.get(userId) ?? 0n, Permission.VIEW_CHANNEL) &&
        level !== 'none' && (level !== 'mentions' || !directedIds || directedIds.has(userId)) &&
        (readAt.get(userId) ?? joinedAt) < message.createdAt
    }).map(({ userId }) => userId)
  }
}
