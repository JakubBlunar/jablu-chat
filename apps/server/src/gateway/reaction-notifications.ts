import { Logger } from '@nestjs/common'
import { hasPermission, messageNotificationUrl, Permission } from '@chat/shared'
import type { ChatGateway } from './gateway.gateway'
import { InAppNotificationKind } from '../prisma-client'
import { getMessageNotificationPreview } from './gateway-push-helpers'
import { messagePushCopy } from '../push/push-copy'

type Context = Pick<ChatGateway, 'prisma' | 'roles' | 'notifications' | 'server'>
const logger = new Logger('ReactionNotifications')

/** Shared by REST, socket toggles and grouped reactions. IDs are actual additions only. */
export async function deliverReactionNotifications(
  ctx: Context,
  messageIds: string[],
  actorId: string,
  emoji: string,
  isCustom: boolean
): Promise<void> {
  if (!messageIds.length) return
  try {
    const [messages, actor] = await Promise.all([
      ctx.prisma.message.findMany({
        where: { id: { in: messageIds }, deleted: false, authorId: { not: actorId } },
        include: { channel: true, author: true, attachments: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      }),
      ctx.prisma.user.findUnique({ where: { id: actorId }, select: { username: true, displayName: true } })
    ])
    if (!actor) return
    const authorName = actor.displayName ?? actor.username
    const reaction = isCustom ? `:${emoji}:` : emoji
    // One alert per author for a grouped action, pointing at their newest original.
    const notified = new Set<string>()
    for (const message of messages) {
      const recipientId = message.authorId
      if (!recipientId || message.author?.isBot || notified.has(recipientId)) continue
      notified.add(recipientId)
      let url: string
      const payload: Record<string, unknown> = {
        messageId: message.id, authorName, actorId, emoji, isCustom,
        ...getMessageNotificationPreview(message.content ?? undefined, message.attachments)
      }
      if (message.channel) {
        const { serverId, id: channelId, name: channelName } = message.channel
        const member = await ctx.prisma.serverMember.findUnique({
          where: { userId_serverId: { userId: recipientId, serverId } }, select: { notifLevel: true }
        })
        if (!member) continue
        const [pref, permissions] = await Promise.all([
          ctx.prisma.channelNotifPref.findUnique({
            where: { userId_channelId: { userId: recipientId, channelId } }, select: { level: true }
          }),
          ctx.roles.getChannelPermissions(serverId, channelId, recipientId)
        ])
        if ((pref?.level ?? member.notifLevel) === 'none' || !hasPermission(permissions, Permission.VIEW_CHANNEL)) continue
        Object.assign(payload, { serverId, channelId, channelName, threadParentId: message.threadParentId })
        url = messageNotificationUrl(`/channels/${serverId}/${channelId}`, message.id, message.threadParentId)
      } else if (message.directConversationId) {
        const conversationId = message.directConversationId
        const member = await ctx.prisma.directConversationMember.findUnique({
          where: { conversationId_userId: { conversationId, userId: recipientId } }, select: { muted: true }
        })
        if (!member || member.muted) continue
        payload.conversationId = conversationId
        url = messageNotificationUrl(`/channels/@me/${conversationId}`, message.id)
      } else continue

      const copy = messagePushCopy({
        en: `${authorName} reacted ${reaction} to your message`,
        cs: `${authorName} reaguje ${reaction} na vaši zprávu`,
        sk: `${authorName} reaguje ${reaction} na vašu správu`
      }, message.content ?? undefined, message.attachments)
      await ctx.notifications.dispatch({
        userIds: [recipientId], kind: InAppNotificationKind.reaction,
        dedupeKey: `reaction:${message.id}:${actorId}:${emoji}`,
        payload, ...copy.en, localized: copy, url, push: true
      })
      // A personal event reaches the author even when this message isn't loaded.
      ctx.server.to(`user:${recipientId}`).emit('notification:reaction', { ...payload, url })
    }
  } catch (error) {
    logger.warn('Reaction notification delivery failed', error)
  }
}
