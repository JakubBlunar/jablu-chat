import { Logger } from '@nestjs/common'
import { hasPermission, Permission } from '@chat/shared'
import type { LinkPreviewService } from '../messages/link-preview.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { PushService } from '../push/push.service'
import type { ReadStateService } from '../read-state/read-state.service'
import type { RedisService } from '../redis/redis.service'
import type { RolesService } from '../roles/roles.service'
import type { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service'
import { InAppNotificationKind } from '../prisma-client'
import type { DmService } from '../dm/dm.service'
import {
  describePushPreview,
  sendPushToOfflineMembers,
  sendPushToThreadParticipants
} from './gateway-push-helpers'

export type MessageAuthor = {
  id?: string | null
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
} | null | undefined

export type ChannelMessageLike = {
  id: string
  content?: string | null
  attachments?: { type: string }[] | null
  author?: MessageAuthor
  threadParentId?: string | null
  replyToId?: string | null
}

export type DmMessageLike = {
  id: string
  content?: string | null
  attachments?: { type: string }[] | null
  author?: MessageAuthor
}

/**
 * Context shared by both helpers. Push is gated on `isUserActivelyEngaged` — is
 * the user looking at the app right now — rather than on whether a socket exists,
 * because a tray-minimised desktop holds a socket open indefinitely.
 */
export type MessageNotificationsContext = {
  prisma: PrismaService
  push: PushService
  redis: RedisService
  roles: RolesService
  inApp: InAppNotificationsService
  readState: ReadStateService
  linkPreviews: LinkPreviewService
  dm?: DmService
  isUserActivelyEngaged: (userId: string) => boolean
  getOnlineUserIds: () => string[]
  emitToChannel: (channelId: string, event: string, data: unknown) => void
  emitToDm: (conversationId: string, event: string, data: unknown) => void
  logger?: Logger
}

const defaultLogger = new Logger('MessageNotifications')

export type DeliverChannelMessageParams = {
  serverId: string
  channelId: string
  channelName?: string
  message: ChannelMessageLike
  /** Author user id, or null for webhook/welcome (synthetic sender). */
  senderId: string | null
  /** Display name shown in push title for synthetic senders (webhook name, server name). */
  senderDisplayName?: string
  /** Optional thread metadata produced by `messages.createMessage`. */
  threadUpdate?: { parentId: string; threadCount: number }
  /** Skip push entirely (welcome message). */
  skipPush?: boolean
  /** Skip in-app records entirely (welcome message). */
  skipInApp?: boolean
  /** Skip link-preview generation. */
  skipLinkPreviews?: boolean
}

/**
 * Single fan-out for any message produced for a server channel — WebSocket
 * `message:send`, REST `POST /channels/:id/messages`, webhook posts, and the
 * welcome message all funnel through this helper.
 *
 * Performs (in order, all failures swallowed and logged):
 *  1. Resolve mentions (skipped when sender is synthetic).
 *  2. Increment per-user mention counter in `channel_read_states`.
 *  3. Emit `message:new` enriched with mention fields.
 *  4. Emit `message:thread-update` if applicable.
 *  5. Record in-app notifications (mention / reply / thread / coalesced channel_message).
 *  6. Generate link previews asynchronously.
 *  7. Send push to recipients who are not looking at the app.
 */
export async function deliverChannelMessage(
  ctx: MessageNotificationsContext,
  params: DeliverChannelMessageParams
): Promise<void> {
  const log = ctx.logger ?? defaultLogger
  const {
    serverId,
    channelId,
    message,
    senderId,
    senderDisplayName,
    threadUpdate,
    skipPush,
    skipInApp,
    skipLinkPreviews
  } = params

  const isThreadReply = !!message.threadParentId

  let mentionedUserIds: string[] = []
  let mentionEveryone = false
  let mentionHere = false

  if (senderId && message.content) {
    try {
      const result = await ctx.readState.resolveMentions(
        message.content,
        serverId,
        senderId,
        ctx.getOnlineUserIds()
      )
      mentionEveryone = result.everyone
      mentionHere = result.here

      const filtered: string[] = []
      for (const uid of result.userIds) {
        try {
          const perms = await ctx.roles.getChannelPermissions(serverId, channelId, uid)
          if (hasPermission(perms, Permission.VIEW_CHANNEL)) {
            filtered.push(uid)
          }
        } catch {
          // member removed mid-send; skip
        }
      }
      mentionedUserIds = filtered

      if (mentionedUserIds.length > 0) {
        await ctx.readState.incrementMention(channelId, mentionedUserIds)
      }
    } catch (err) {
      log.warn(`resolveMentions failed for channel ${channelId}: ${(err as Error)?.message}`)
    }
  }

  // Replying to someone counts as addressing them, so it gets the same delivery
  // weight as a mention. Kept out of `mentionedUserIds` because that field means
  // "@-mentioned" to every client that reads it.
  const replyTargetId = await resolveReplyTarget(ctx, {
    serverId,
    channelId,
    senderId,
    replyToId: message.replyToId,
    isThreadReply,
    mentionedUserIds
  })

  ctx.emitToChannel(channelId, 'message:new', {
    ...message,
    serverId,
    mentionedUserIds,
    mentionEveryone,
    mentionHere
  })

  if (threadUpdate) {
    ctx.emitToChannel(channelId, 'message:thread-update', {
      parentId: threadUpdate.parentId,
      threadCount: threadUpdate.threadCount,
      lastThreadReply: {
        content: message.content ?? null,
        author: message.author ?? null,
        createdAt: new Date().toISOString()
      }
    })
  }

  const authorName =
    message.author?.displayName ?? message.author?.username ?? senderDisplayName ?? 'Someone'
  const snippet =
    describePushPreview(message.content ?? undefined, message.attachments ?? undefined) || 'Message'

  let channelName = params.channelName
  if (!channelName && !skipInApp) {
    try {
      const ch = await ctx.prisma.channel.findUnique({
        where: { id: channelId },
        select: { name: true }
      })
      channelName = ch?.name ?? 'channel'
    } catch {
      channelName = 'channel'
    }
  }
  const safeChannelName = channelName ?? 'channel'

  if (!skipInApp) {
    if (mentionedUserIds.length > 0) {
      ctx.inApp
        .recordMentions(mentionedUserIds, {
          serverId,
          channelId,
          channelName: safeChannelName,
          messageId: message.id,
          authorName,
          snippet
        })
        .catch((err) => log.warn(`recordMentions failed: ${(err as Error)?.message}`))
    }

    if (replyTargetId) {
      ctx.inApp
        .record([replyTargetId], {
          kind: InAppNotificationKind.reply,
          dedupeKey: `reply:${message.id}`,
          payload: {
            serverId,
            channelId,
            channelName: safeChannelName,
            messageId: message.id,
            replyToId: message.replyToId,
            authorName,
            snippet
          }
        })
        .catch((err) => log.warn(`record reply failed: ${(err as Error)?.message}`))
    }

    if (isThreadReply && message.threadParentId && senderId) {
      void (async () => {
        try {
          const participantIds = await ctx.inApp.resolveThreadParticipantUserIds(
            message.threadParentId!,
            senderId
          )
          if (participantIds.length === 0) return
          await ctx.inApp.recordThreadActivity(participantIds, {
            serverId,
            channelId,
            channelName: safeChannelName,
            threadParentId: message.threadParentId!,
            messageId: message.id,
            authorName,
            snippet
          })
        } catch (err) {
          log.warn(`recordThreadActivity failed: ${(err as Error)?.message}`)
        }
      })()
    }

    if (!isThreadReply) {
      void (async () => {
        try {
          const recipients = await resolveChannelRecipients(
            ctx,
            serverId,
            channelId,
            senderId,
            replyTargetId ? [...mentionedUserIds, replyTargetId] : mentionedUserIds
          )
          if (recipients.length === 0) return
          await ctx.inApp.recordChannelMessage(recipients, {
            serverId,
            channelId,
            channelName: safeChannelName,
            messageId: message.id,
            authorName,
            snippet
          })
        } catch (err) {
          log.warn(`recordChannelMessage failed: ${(err as Error)?.message}`)
        }
      })()
    }
  }

  if (!skipLinkPreviews && message.content) {
    ctx.linkPreviews
      .generatePreviews(message.id, message.content)
      .then((previews) => {
        if (previews.length > 0) {
          ctx.emitToChannel(channelId, 'message:link-previews', {
            messageId: message.id,
            linkPreviews: previews
          })
        }
      })
      .catch((err) => log.warn(`Link preview fetch failed: ${(err as Error)?.message}`))
  }

  if (!skipPush) {
    const pushCtx = {
      prisma: ctx.prisma,
      push: ctx.push,
      redis: ctx.redis,
      roles: ctx.roles,
      isUserActivelyEngaged: ctx.isUserActivelyEngaged
    }
    const senderForPush = senderId ?? ''
    const senderNameForPush =
      message.author?.displayName ?? message.author?.username ?? senderDisplayName ?? 'Someone'
    const attachments = message.attachments ?? undefined

    if (isThreadReply && message.threadParentId) {
      sendPushToThreadParticipants(
        pushCtx,
        message.threadParentId,
        channelId,
        serverId,
        senderForPush,
        senderNameForPush,
        message.content ?? undefined,
        attachments
      ).catch((err) => log.warn(`Thread push failed: ${(err as Error)?.message}`))
    } else {
      sendPushToOfflineMembers(
        pushCtx,
        serverId,
        senderForPush,
        senderNameForPush,
        message.content ?? undefined,
        `/channels/${serverId}/${channelId}`,
        channelId,
        // The reply target rides along so a "mentions only" preference still
        // delivers a direct reply.
        replyTargetId ? [...mentionedUserIds, replyTargetId] : mentionedUserIds,
        attachments
      ).catch((err) => log.warn(`Channel push failed: ${(err as Error)?.message}`))
    }
  }
}

/**
 * The author of the message being replied to, when they deserve their own
 * notification: not the sender replying to themselves, not someone already
 * @-mentioned in the same message (that row wins), and not without read access.
 *
 * Thread replies are excluded — they already produce a `thread_reply` row, and
 * two notifications for one message would be worse than none.
 */
async function resolveReplyTarget(
  ctx: MessageNotificationsContext,
  input: {
    serverId: string
    channelId: string
    senderId: string | null
    replyToId?: string | null
    isThreadReply: boolean
    mentionedUserIds: string[]
  }
): Promise<string | null> {
  const { serverId, channelId, senderId, replyToId, isThreadReply, mentionedUserIds } = input
  if (!replyToId || !senderId || isThreadReply) return null

  try {
    const parent = await ctx.prisma.message.findUnique({
      where: { id: replyToId },
      select: { authorId: true }
    })
    const authorId = parent?.authorId
    if (!authorId || authorId === senderId) return null
    if (mentionedUserIds.includes(authorId)) return null

    const perms = await ctx.roles.getChannelPermissions(serverId, channelId, authorId)
    return hasPermission(perms, Permission.VIEW_CHANNEL) ? authorId : null
  } catch {
    return null
  }
}

/**
 * All human server members with VIEW_CHANNEL permission, excluding the sender
 * and any already-mentioned users (mentions get a separate `mention` row via
 * `recordMentions`). Mentioned users still appear in their own row but we don't
 * want a redundant `channel_message` row for the same activity.
 */
async function resolveChannelRecipients(
  ctx: MessageNotificationsContext,
  serverId: string,
  channelId: string,
  senderId: string | null,
  mentionedUserIds: string[]
): Promise<string[]> {
  const members = await ctx.prisma.serverMember.findMany({
    where: {
      serverId,
      ...(senderId ? { NOT: { userId: senderId } } : {}),
      // Bots never open a notification center, so a row per bot per message is
      // pure write amplification that also evicts real rows via the per-user cap.
      user: { isBot: false }
    },
    select: { userId: true }
  })
  const mentionSet = new Set(mentionedUserIds)
  const candidateIds = members.map((m) => m.userId).filter((uid) => !mentionSet.has(uid))
  const eligible: string[] = []
  for (const uid of candidateIds) {
    try {
      const perms = await ctx.roles.getChannelPermissions(serverId, channelId, uid)
      if (hasPermission(perms, Permission.VIEW_CHANNEL)) {
        eligible.push(uid)
      }
    } catch {
      // member removed; skip
    }
  }
  return eligible
}

export type DeliverDmMessageParams = {
  conversationId: string
  message: DmMessageLike
  /** Author user id, or null for synthetic senders (none today, but kept symmetric). */
  senderId: string | null
  skipPush?: boolean
  skipInApp?: boolean
  skipLinkPreviews?: boolean
}

/**
 * DM equivalent of `deliverChannelMessage`. Used by both the WS `dm:send`
 * handler and the REST `POST /dm/:id/messages` controller.
 *
 * Performs:
 *  1. Increment DM mention counter for non-sender members.
 *  2. Emit `dm:new`.
 *  3. Record coalesced DM in-app row.
 *  4. Generate link previews asynchronously.
 *  5. Send push to DM members who are not looking at the app.
 */
export async function deliverDmMessage(
  ctx: MessageNotificationsContext,
  params: DeliverDmMessageParams
): Promise<void> {
  const log = ctx.logger ?? defaultLogger
  const { conversationId, message, senderId, skipPush, skipInApp, skipLinkPreviews } = params

  const memberRows = await ctx.prisma.directConversationMember.findMany({
    where: { conversationId },
    select: { userId: true }
  })
  const memberIds = memberRows.map((m) => m.userId)
  const otherMemberIds = senderId ? memberIds.filter((id) => id !== senderId) : memberIds

  try {
    await ctx.readState.incrementDmMention(conversationId, otherMemberIds)
  } catch (err) {
    log.warn(`incrementDmMention failed: ${(err as Error)?.message}`)
  }

  ctx.emitToDm(conversationId, 'dm:new', {
    ...message,
    conversationId
  })

  const authorName = message.author?.displayName ?? message.author?.username ?? 'Someone'
  const snippet =
    describePushPreview(message.content ?? undefined, message.attachments ?? undefined) || 'Message'

  if (!skipInApp && otherMemberIds.length > 0) {
    ctx.inApp
      .recordDmMessages(otherMemberIds, {
        conversationId,
        messageId: message.id,
        authorName,
        snippet
      })
      .catch((err) => log.warn(`recordDmMessages failed: ${(err as Error)?.message}`))
  }

  if (!skipLinkPreviews && message.content) {
    ctx.linkPreviews
      .generatePreviews(message.id, message.content)
      .then((previews) => {
        if (previews.length > 0) {
          ctx.emitToDm(conversationId, 'dm:link-previews', {
            messageId: message.id,
            conversationId,
            linkPreviews: previews
          })
        }
      })
      .catch((err) => log.warn(`DM link preview failed: ${(err as Error)?.message}`))
  }

  if (!skipPush) {
    const awayMembers = otherMemberIds.filter((id) => !ctx.isUserActivelyEngaged(id))
    if (awayMembers.length > 0) {
      const preview = describePushPreview(
        message.content ?? undefined,
        message.attachments ?? undefined
      )
      ctx.push
        .sendToUsers(awayMembers, {
          title: `DM from ${authorName}`,
          body: preview,
          url: `/channels/@me/${conversationId}`
        })
        .catch((err) => log.warn(`DM push failed: ${(err as Error)?.message}`))
    }
  }
}
