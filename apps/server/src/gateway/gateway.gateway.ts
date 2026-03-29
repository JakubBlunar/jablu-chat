import { BadRequestException, Logger, OnModuleDestroy, UseGuards } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { MAX_MESSAGE_LENGTH } from '@chat/shared'
import { Server, Socket } from 'socket.io'
import { AutoModService } from '../automod/automod.service'
import { DmService } from '../dm/dm.service'
import { EventBusService } from '../events/event-bus.service'
import { LinkPreviewService } from '../messages/link-preview.service'
import { MessagesService } from '../messages/messages.service'
import { PollsService } from '../messages/polls.service'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { ReadStateService } from '../read-state/read-state.service'
import { RedisService } from '../redis/redis.service'
import { WsJwtGuard, WsUser } from './ws-jwt.guard'

@WebSocketGateway({ namespace: '/' })
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatGateway.name)

  @WebSocketServer()
  server!: Server

  /** userId -> number of active socket connections */
  private readonly onlineUsers = new Map<string, number>()

  /** userId -> manually chosen status (dnd) that should not be overridden by idle detection */
  private readonly manualStatus = new Map<string, string>()

  /** socketId -> activity status for that specific connection */
  private readonly socketActivityStatus = new Map<string, 'online' | 'idle'>()

  /** channelId -> Set of participants in voice channel */
  private readonly voiceParticipants = new Map<string, Map<string, { userId: string; username: string }>>()

  /** socketId -> channelId the socket is in (for cleanup on disconnect) */
  private readonly socketVoiceChannel = new Map<string, string>()

  /** userId -> pending offline timer + captured serverIds (grace period before marking offline) */
  private readonly disconnectGrace = new Map<string, { timer: NodeJS.Timeout; serverIds: string[] }>()

  private static readonly DISCONNECT_GRACE_MS = 2 * 60 * 1000

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly polls: PollsService,
    private readonly automod: AutoModService,
    private readonly dm: DmService,
    private readonly linkPreviews: LinkPreviewService,
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly events: EventBusService,
    private readonly readState: ReadStateService,
    private readonly push: PushService,
    private readonly redis: RedisService
  ) {}

  onModuleDestroy() {
    for (const { timer } of this.disconnectGrace.values()) {
      clearTimeout(timer)
    }
    this.disconnectGrace.clear()
  }

  private addOnlineUser(userId: string): boolean {
    const count = this.onlineUsers.get(userId) ?? 0
    this.onlineUsers.set(userId, count + 1)
    return count === 0
  }

  private removeOnlineUser(userId: string): boolean {
    const count = this.onlineUsers.get(userId) ?? 0
    if (count <= 1) {
      this.onlineUsers.delete(userId)
      return true
    }
    this.onlineUsers.set(userId, count - 1)
    return false
  }

  private isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId) || this.disconnectGrace.has(userId)
  }

  getOnlineUserIds(): string[] {
    const ids = [...this.onlineUsers.keys()]
    for (const userId of this.disconnectGrace.keys()) {
      if (!this.onlineUsers.has(userId)) {
        ids.push(userId)
      }
    }
    return ids
  }

  afterInit() {
    this.events.on('user:status', async (payload: { userId: string; status: string }) => {
      if (payload.status === 'dnd') {
        this.manualStatus.set(payload.userId, 'dnd')
      } else {
        this.manualStatus.delete(payload.userId)
      }

      const memberships = await this.prisma.serverMember.findMany({
        where: { userId: payload.userId },
        select: { serverId: true }
      })
      for (const m of memberships) {
        this.server.to(`server:${m.serverId}`).emit('user:status', {
          userId: payload.userId,
          status: payload.status
        })
      }
    })

    this.events.on('user:custom-status', async (payload: { userId: string; customStatus: string | null }) => {
      const memberships = await this.prisma.serverMember.findMany({
        where: { userId: payload.userId },
        select: { serverId: true }
      })
      for (const m of memberships) {
        this.server.to(`server:${m.serverId}`).emit('user:custom-status', {
          userId: payload.userId,
          customStatus: payload.customStatus
        })
      }
    })

    this.events.on(
      'webhook:message',
      (payload: { channelId: string; message: unknown; serverId?: string; webhookName?: string }) => {
        this.emitToChannel(payload.channelId, 'message:new', payload.message)

        if (payload.serverId && payload.webhookName) {
          const content = (payload.message as { content?: string })?.content
          this.sendPushToOfflineMembers(
            payload.serverId,
            '',
            payload.webhookName,
            content,
            `/channels/${payload.serverId}/${payload.channelId}`,
            payload.channelId,
            []
          ).catch(() => {})
        }
      }
    )

    this.events.on(
      'webhook:link-previews',
      (payload: { channelId: string; messageId: string; linkPreviews: unknown }) => {
        this.emitToChannel(payload.channelId, 'message:link-previews', {
          messageId: payload.messageId,
          linkPreviews: payload.linkPreviews
        })
      }
    )

    this.events.on('dm:read', (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
      this.emitToDm(payload.conversationId, 'dm:read', payload)
    })

    this.events.on('admin:message:delete', (payload: { messageId: string; channelId: string }) => {
      this.emitToChannel(payload.channelId, 'message:delete', payload)
    })

    this.events.on('admin:dm:delete', (payload: { messageId: string; conversationId: string }) => {
      this.emitToDm(payload.conversationId, 'dm:delete', payload)
    })

    this.events.on('channel:reorder', (payload: { serverId: string; channelIds: string[] }) => {
      this.server.to(`server:${payload.serverId}`).emit('channel:reorder', { channelIds: payload.channelIds })
    })

    this.events.on('channel:created', async (payload: { serverId: string; channel: { id: string } }) => {
      this.server.to(`server:${payload.serverId}`).emit('channel:created', payload)
      const sockets = await this.server.in(`server:${payload.serverId}`).fetchSockets()
      for (const s of sockets) s.join(`channel:${payload.channel.id}`)
    })

    this.events.on('channel:updated', (payload: { serverId: string; channel: unknown }) => {
      this.server.to(`server:${payload.serverId}`).emit('channel:updated', payload)
    })

    this.events.on('channel:deleted', (payload: { serverId: string; channelId: string }) => {
      this.server.to(`server:${payload.serverId}`).emit('channel:deleted', payload)
    })

    this.events.on('category:created', (payload: { serverId: string; category: unknown }) => {
      this.server.to(`server:${payload.serverId}`).emit('category:created', payload)
    })

    this.events.on('category:updated', (payload: { serverId: string; category: unknown }) => {
      this.server.to(`server:${payload.serverId}`).emit('category:updated', payload)
    })

    this.events.on('category:deleted', (payload: { serverId: string; categoryId: string }) => {
      this.server.to(`server:${payload.serverId}`).emit('category:deleted', payload)
    })

    this.events.on('category:reorder', (payload: { serverId: string; categoryIds: string[] }) => {
      this.server.to(`server:${payload.serverId}`).emit('category:reorder', { categoryIds: payload.categoryIds })
    })

    this.events.on('member:joined', async (payload: { serverId: string; member: unknown }) => {
      const { serverId, member } = payload as { serverId: string; member: { userId: string } }
      this.server.to(`server:${serverId}`).emit('member:joined', { serverId, member })

      const channels = await this.prisma.channel.findMany({
        where: { serverId },
        select: { id: true }
      })
      const userSockets = await this.server.in(`user:${member.userId}`).fetchSockets()
      for (const s of userSockets) {
        s.join(`server:${serverId}`)
        for (const ch of channels) {
          s.join(`channel:${ch.id}`)
        }
        const sids = (s.data as { serverIds?: string[] }).serverIds
        if (sids && !sids.includes(serverId)) {
          sids.push(serverId)
        }
      }
    })

    this.events.on('user:profile', async (payload: { userId: string; displayName?: string; bio?: string; avatarUrl?: string | null }) => {
      const memberships = await this.prisma.serverMember.findMany({
        where: { userId: payload.userId },
        select: { serverId: true }
      })
      for (const m of memberships) {
        this.server.to(`server:${m.serverId}`).emit('user:profile', payload)
      }
    })

    this.events.on('server:updated', (payload: { serverId: string; name?: string; iconUrl?: string | null }) => {
      this.server.to(`server:${payload.serverId}`).emit('server:updated', payload)
    })

    this.events.on('member:updated', (payload: { serverId: string; userId: string; roleId?: string }) => {
      this.server.to(`server:${payload.serverId}`).emit('member:updated', payload)
    })

    this.events.on('member:removed', async (payload: { serverId: string; userId: string }) => {
      this.server.to(`server:${payload.serverId}`).emit('member:left', {
        serverId: payload.serverId,
        userId: payload.userId
      })

      const channels = await this.prisma.channel.findMany({
        where: { serverId: payload.serverId },
        select: { id: true }
      })
      const userSockets = await this.server.in(`user:${payload.userId}`).fetchSockets()
      for (const s of userSockets) {
        s.leave(`server:${payload.serverId}`)
        for (const ch of channels) {
          s.leave(`channel:${ch.id}`)
        }
        const serverIds = (s.data as { serverIds?: string[] }).serverIds
        if (serverIds) {
          const idx = serverIds.indexOf(payload.serverId)
          if (idx !== -1) serverIds.splice(idx, 1)
        }
      }
    })

    for (const ev of ['event:created', 'event:updated', 'event:cancelled', 'event:started', 'event:completed'] as const) {
      this.events.on(ev, (payload: { serverId: string; event: unknown }) => {
        this.server.to(`server:${payload.serverId}`).emit(ev, payload.event)
      })
    }

    this.events.on(
      'event:interest',
      (payload: { serverId: string; eventId: string; userId: string; interested: boolean; count: number }) => {
        this.server.to(`server:${payload.serverId}`).emit('event:interest', {
          eventId: payload.eventId,
          userId: payload.userId,
          interested: payload.interested,
          count: payload.count
        })
      }
    )

    this.events.on(
      'friend:request',
      (payload: { friendshipId: string; requester: Record<string, unknown>; addressee: Record<string, unknown> }) => {
        const { friendshipId, requester, addressee } = payload
        const addresseeId = (addressee as { id: string }).id
        const requesterName =
          (requester as { displayName?: string }).displayName ??
          (requester as { username?: string }).username ??
          'Someone'

        this.server.to(`user:${addresseeId}`).emit('friend:request', {
          friendshipId,
          user: requester,
          direction: 'incoming',
          createdAt: new Date().toISOString()
        })

        if (!this.isUserOnline(addresseeId)) {
          this.push
            .sendToUsers([addresseeId], {
              title: 'Friend Request',
              body: `${requesterName} sent you a friend request`,
              url: '/channels/@me'
            })
            .catch(() => {})
        }
      }
    )

    this.events.on(
      'friend:accepted',
      (payload: { friendshipId: string; requester: Record<string, unknown>; addressee: Record<string, unknown> }) => {
        const { friendshipId, requester, addressee } = payload
        this.server.to(`user:${(requester as { id: string }).id}`).emit('friend:accepted', {
          friendshipId,
          user: addressee
        })
        this.server.to(`user:${(addressee as { id: string }).id}`).emit('friend:accepted', {
          friendshipId,
          user: requester
        })
      }
    )

    this.events.on(
      'friend:declined',
      (payload: { friendshipId: string; requesterId: string; addresseeId: string }) => {
        this.server.to(`user:${payload.requesterId}`).emit('friend:declined', {
          friendshipId: payload.friendshipId
        })
      }
    )

    this.events.on(
      'friend:cancelled',
      (payload: { friendshipId: string; requesterId: string; addresseeId: string }) => {
        this.server.to(`user:${payload.addresseeId}`).emit('friend:cancelled', {
          friendshipId: payload.friendshipId
        })
      }
    )

    this.events.on(
      'friend:removed',
      (payload: { friendshipId: string; userId: string; otherUserId: string }) => {
        this.server.to(`user:${payload.otherUserId}`).emit('friend:removed', {
          friendshipId: payload.friendshipId,
          userId: payload.userId
        })
      }
    )
  }

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data)
  }

  emitToDm(conversationId: string, event: string, data: unknown) {
    this.server.to(`dm:${conversationId}`).emit(event, data)
  }

  async handleConnection(client: Socket) {
    let user: WsUser
    try {
      user = await this.wsJwtGuard.authenticateClient(client)
    } catch {
      client.disconnect(true)
      return
    }

    const memberships = await this.prisma.serverMember.findMany({
      where: { userId: user.id },
      include: {
        server: {
          include: {
            channels: { select: { id: true } },
            members: { select: { userId: true } }
          }
        }
      }
    })

    const serverIds: string[] = []
    const allMemberUserIds = new Set<string>()
    for (const m of memberships) {
      serverIds.push(m.serverId)
      client.join(`server:${m.serverId}`)
      for (const ch of m.server.channels) {
        client.join(`channel:${ch.id}`)
      }
      for (const mem of m.server.members) {
        allMemberUserIds.add(mem.userId)
      }
    }
    ;(client.data as { serverIds?: string[] }).serverIds = serverIds
    client.join(`user:${user.id}`)

    const pendingGrace = this.disconnectGrace.get(user.id)
    if (pendingGrace) {
      clearTimeout(pendingGrace.timer)
      this.disconnectGrace.delete(user.id)
    }

    const isFirstConnection = this.addOnlineUser(user.id)
    this.socketActivityStatus.set(client.id, 'online')

    if (pendingGrace) {
      const effectiveStatus = this.getEffectiveStatus(user.id)
      if (this.lastBroadcastedStatus.get(user.id) !== effectiveStatus) {
        this.lastBroadcastedStatus.set(user.id, effectiveStatus)
        await this.prisma.user.update({
          where: { id: user.id },
          data: { status: effectiveStatus }
        })
        for (const sid of serverIds) {
          this.server.to(`server:${sid}`).emit('user:status', { userId: user.id, status: effectiveStatus })
        }
      }
    } else if (isFirstConnection) {
      this.lastBroadcastedStatus.set(user.id, 'online')
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'online', lastSeenAt: new Date() }
      })
      for (const sid of serverIds) {
        this.server.to(`server:${sid}`).emit('user:online', { userId: user.id })
        this.server.to(`server:${sid}`).emit('user:status', { userId: user.id, status: 'online' })
      }
    }

    const onlineNow = this.getOnlineUserIds().filter((id) => allMemberUserIds.has(id))
    client.emit('presence:init', { onlineUserIds: onlineNow })

    const dmConversations = await this.prisma.directConversationMember.findMany({
      where: { userId: user.id },
      select: { conversationId: true }
    })
    for (const dc of dmConversations) {
      client.join(`dm:${dc.conversationId}`)
    }

    const userChannelIds = new Set<string>()
    for (const m of memberships) {
      for (const ch of m.server.channels) {
        userChannelIds.add(ch.id)
      }
    }
    const voiceState: Record<string, { userId: string; username: string }[]> = {}
    for (const [chId, participants] of this.voiceParticipants) {
      if (userChannelIds.has(chId)) {
        voiceState[chId] = [...participants.values()]
      }
    }
    client.emit('voice:participants', voiceState)
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as { user?: WsUser; serverIds?: string[] }
    const user = data.user
    const serverIds = data.serverIds

    this.removeVoiceParticipant(client.id, serverIds)

    if (!user || !serverIds?.length) {
      return
    }

    const isLastConnection = this.removeOnlineUser(user.id)

    this.socketActivityStatus.delete(client.id)

    if (isLastConnection) {
      const capturedServerIds = [...serverIds]
      const userId = user.id
      const timer = setTimeout(async () => {
        this.disconnectGrace.delete(userId)
        if (this.onlineUsers.has(userId)) return
        this.manualStatus.delete(userId)
        this.lastBroadcastedStatus.delete(userId)
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'offline', lastSeenAt: new Date() }
        })
        for (const sid of capturedServerIds) {
          this.server.to(`server:${sid}`).emit('user:offline', { userId })
        }
      }, ChatGateway.DISCONNECT_GRACE_MS)
      this.disconnectGrace.set(userId, { timer, serverIds: capturedServerIds })
    }
  }

  private removeVoiceParticipant(socketId: string, serverIds?: string[]) {
    const channelId = this.socketVoiceChannel.get(socketId)
    if (!channelId) return

    this.socketVoiceChannel.delete(socketId)
    const participants = this.voiceParticipants.get(channelId)
    if (!participants) return

    const leaving = participants.get(socketId)
    participants.delete(socketId)
    if (participants.size === 0) {
      this.voiceParticipants.delete(channelId)
    }

    if (leaving && serverIds) {
      for (const sid of serverIds) {
        this.server.to(`server:${sid}`).emit('voice:participant-left', {
          channelId,
          userId: leaving.userId
        })
      }
    }
  }

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      channelId: string
      content?: string
      replyToId?: string
      attachmentIds?: string[]
      threadParentId?: string
    }
  ) {
    if (body.content && body.content.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`)
    }
    const user = (client.data as { user: WsUser }).user

    if (body.content) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: body.channelId },
        select: { serverId: true }
      })
      if (channel) {
        const check = await this.automod.checkMessage(channel.serverId, user.id, body.content)
        if (!check.allowed) {
          return { ok: false, error: check.reason ?? 'Message blocked by auto-moderation' }
        }
      }
    }

    const msg = await this.messages.createMessage(
      body.channelId,
      user.id,
      body.content,
      body.replyToId,
      body.attachmentIds,
      body.threadParentId
    )

    const { serverId, threadUpdate, ...msgRest } = msg as typeof msg & { threadUpdate?: { parentId: string; threadCount: number } }

    let mentionedUserIds: string[] = []
    let mentionEveryone = false
    let mentionHere = false
    if (body.content && serverId) {
      const result = await this.readState.resolveMentions(
        body.content,
        serverId,
        user.id,
        this.getOnlineUserIds()
      )
      mentionedUserIds = result.userIds
      mentionEveryone = result.everyone
      mentionHere = result.here
      if (mentionedUserIds.length > 0) {
        await this.readState.incrementMention(body.channelId, mentionedUserIds)
      }
    }

    this.emitToChannel(body.channelId, 'message:new', {
      ...msgRest,
      mentionedUserIds,
      mentionEveryone,
      mentionHere
    })

    if (threadUpdate) {
      this.emitToChannel(body.channelId, 'message:thread-update', {
        parentId: threadUpdate.parentId,
        threadCount: threadUpdate.threadCount,
        lastThreadMessage: {
          authorId: user.id,
          createdAt: msgRest.createdAt
        }
      })
    }

    if (body.content) {
      this.linkPreviews
        .generatePreviews(msgRest.id, body.content)
        .then((previews) => {
          if (previews.length > 0) {
            this.emitToChannel(body.channelId, 'message:link-previews', {
              messageId: msgRest.id,
              linkPreviews: previews
            })
          }
        })
        .catch((err) => this.logger.warn('Link preview fetch failed', err?.message))
    }

    if (serverId) {
      this.sendPushToOfflineMembers(
        serverId,
        user.id,
        msgRest.author?.displayName ?? msgRest.author?.username ?? 'Someone',
        body.content,
        `/channels/${serverId}/${body.channelId}`,
        body.channelId,
        mentionedUserIds,
        msgRest.attachments
      ).catch((err) => this.logger.warn('Push notification failed', err?.message))
    }

    return { ok: true, message: msgRest }
  }

  @SubscribeMessage('message:edit')
  async onMessageEdit(@ConnectedSocket() client: Socket, @MessageBody() body: { messageId: string; content: string }) {
    if (body.content && body.content.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`)
    }
    const user = (client.data as { user: WsUser }).user
    const updated = await this.messages.editMessage(body.messageId, user.id, body.content)
    const channelId = updated.channelId
    if (channelId) {
      this.emitToChannel(channelId, 'message:edit', updated)
    }
    return { ok: true, message: updated }
  }

  @SubscribeMessage('message:delete')
  async onMessageDelete(@ConnectedSocket() client: Socket, @MessageBody() body: { messageId: string }) {
    const user = (client.data as { user: WsUser }).user
    const channelId = await this.messages.getMessageChannelId(body.messageId)
    await this.messages.deleteMessage(body.messageId, user.id)
    if (channelId) {
      this.emitToChannel(channelId, 'message:delete', {
        messageId: body.messageId,
        channelId
      })
    }
    return { ok: true }
  }

  @SubscribeMessage('reaction:toggle')
  async onReactionToggle(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; emoji: string; isCustom?: boolean }
  ) {
    const user = (client.data as { user: WsUser }).user
    const result = await this.messages.toggleReaction(body.messageId, user.id, body.emoji, body.isCustom ?? false)
    const event = result.action === 'added' ? 'reaction:add' : 'reaction:remove'
    const payload = {
      messageId: body.messageId,
      emoji: body.emoji,
      userId: user.id,
      isCustom: result.isCustom
    }
    if (result.channelId) {
      this.emitToChannel(result.channelId, event, payload)
    } else if (result.directConversationId) {
      this.emitToDm(result.directConversationId, event, {
        ...payload,
        conversationId: result.directConversationId
      })
    }
    return { ok: true, action: result.action }
  }

  @SubscribeMessage('message:pin')
  async onMessagePin(@ConnectedSocket() client: Socket, @MessageBody() body: { messageId: string; channelId: string }) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.messages.pinMessage(body.messageId, user.id, body.channelId)
    this.emitToChannel(body.channelId, 'message:pin', msg)
    return { ok: true, message: msg }
  }

  @SubscribeMessage('message:unpin')
  async onMessageUnpin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; channelId: string }
  ) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.messages.unpinMessage(body.messageId, user.id, body.channelId)
    this.emitToChannel(body.channelId, 'message:unpin', msg)
    return { ok: true, message: msg }
  }

  @SubscribeMessage('poll:vote')
  async onPollVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { pollId: string; optionId: string }
  ) {
    const user = (client.data as { user: WsUser }).user
    const result = await this.polls.votePoll(body.pollId, body.optionId, user.id)
    if (result.channelId) {
      this.emitToChannel(result.channelId, 'poll:vote', result.poll)
    }
    return { ok: true, poll: result.poll }
  }

  @SubscribeMessage('activity:idle')
  async onActivityIdle(@ConnectedSocket() client: Socket) {
    return this.setActivityStatus(client, 'idle')
  }

  @SubscribeMessage('activity:active')
  async onActivityActive(@ConnectedSocket() client: Socket) {
    return this.setActivityStatus(client, 'online')
  }

  /** userId -> last broadcasted effective status, avoids redundant DB writes */
  private readonly lastBroadcastedStatus = new Map<string, string>()

  private async setActivityStatus(client: Socket, status: 'online' | 'idle') {
    const user = (client.data as { user: WsUser }).user
    if (this.manualStatus.get(user.id) === 'dnd') {
      return { ok: true }
    }

    this.socketActivityStatus.set(client.id, status)

    const effectiveStatus = this.getEffectiveStatus(user.id)
    if (this.lastBroadcastedStatus.get(user.id) === effectiveStatus) {
      return { ok: true }
    }

    this.lastBroadcastedStatus.set(user.id, effectiveStatus)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: effectiveStatus }
    })
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? []
    for (const sid of serverIds) {
      this.server.to(`server:${sid}`).emit('user:status', { userId: user.id, status: effectiveStatus })
    }
    return { ok: true }
  }

  private getEffectiveStatus(userId: string): 'online' | 'idle' {
    for (const [, participants] of this.voiceParticipants) {
      for (const [, p] of participants) {
        if (p.userId === userId) return 'online'
      }
    }
    const rooms = this.server?.sockets?.adapter?.rooms
    if (!rooms) return 'idle'
    const userRoom = rooms.get(`user:${userId}`)
    if (!userRoom) return 'idle'
    for (const socketId of userRoom) {
      if (this.socketActivityStatus.get(socketId) === 'online') return 'online'
    }
    return 'idle'
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = (client.data as { user: WsUser }).user
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)
    this.emitToChannel(body.channelId, 'user:typing', {
      userId: user.id,
      channelId: body.channelId,
      username: user.displayName ?? user.username
    })
    return { ok: true }
  }

  @SubscribeMessage('dm:send')
  async onDmSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      conversationId: string
      content?: string
      replyToId?: string
      attachmentIds?: string[]
    }
  ) {
    if (body.content && body.content.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`)
    }
    const user = (client.data as { user: WsUser }).user
    const msg = await this.dm.createMessage(
      body.conversationId,
      user.id,
      body.content,
      body.replyToId,
      body.attachmentIds
    )

    const memberIds = await this.dm.getConversationMemberIds(body.conversationId)
    const roomName = `dm:${body.conversationId}`
    const existingRoom = await this.server.in(roomName).fetchSockets()
    const alreadyJoined = new Set(existingRoom.map((s) => (s.data as { user?: WsUser }).user?.id).filter(Boolean))
    const missingIds = memberIds.filter((id) => !alreadyJoined.has(id))
    if (missingIds.length > 0) {
      for (const mid of missingIds) {
        const userSockets = await this.server.in(`user:${mid}`).fetchSockets()
        for (const s of userSockets) s.join(roomName)
      }
    }

    const otherMemberIds = memberIds.filter((id) => id !== user.id)
    await this.readState.incrementDmMention(body.conversationId, otherMemberIds)

    this.emitToDm(body.conversationId, 'dm:new', {
      ...msg,
      conversationId: body.conversationId
    })

    if (body.content) {
      this.linkPreviews
        .generatePreviews(msg.id, body.content)
        .then((previews) => {
          if (previews.length > 0) {
            this.emitToDm(body.conversationId, 'dm:link-previews', {
              messageId: msg.id,
              conversationId: body.conversationId,
              linkPreviews: previews
            })
          }
        })
        .catch((err) => this.logger.warn('DM link preview fetch failed', err?.message))
    }

    const offlineDmMembers = otherMemberIds.filter((id) => !this.isUserOnline(id))
    if (offlineDmMembers.length > 0) {
      const authorName = msg.author?.displayName ?? msg.author?.username ?? 'Someone'
      const preview = this.describePushPreview(body.content, msg.attachments)
      this.push
        .sendToUsers(offlineDmMembers, {
          title: `DM from ${authorName}`,
          body: preview,
          url: `/channels/@me/${body.conversationId}`
        })
        .catch((err) => this.logger.warn('DM push notification failed', err?.message))
    }

    return { ok: true, message: msg }
  }

  @SubscribeMessage('dm:edit')
  async onDmEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { conversationId: string; messageId: string; content: string }
  ) {
    if (body.content && body.content.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`)
    }
    const user = (client.data as { user: WsUser }).user
    const updated = await this.dm.editMessage(body.conversationId, body.messageId, user.id, body.content)
    this.emitToDm(body.conversationId, 'dm:edit', {
      ...updated,
      conversationId: body.conversationId
    })
    return { ok: true, message: updated }
  }

  @SubscribeMessage('dm:delete')
  async onDmDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; messageId: string }
  ) {
    const user = (client.data as { user: WsUser }).user
    await this.dm.deleteMessage(body.conversationId, body.messageId, user.id)
    this.emitToDm(body.conversationId, 'dm:delete', {
      messageId: body.messageId,
      conversationId: body.conversationId
    })
    return { ok: true }
  }

  @SubscribeMessage('dm:pin')
  async onDmPin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; messageId: string }
  ) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.dm.pinMessage(body.conversationId, body.messageId, user.id)
    this.emitToDm(body.conversationId, 'dm:pin', {
      ...msg,
      conversationId: body.conversationId
    })
    return { ok: true, message: msg }
  }

  @SubscribeMessage('dm:unpin')
  async onDmUnpin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; messageId: string }
  ) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.dm.unpinMessage(body.conversationId, body.messageId, user.id)
    this.emitToDm(body.conversationId, 'dm:unpin', {
      ...msg,
      conversationId: body.conversationId
    })
    return { ok: true, message: msg }
  }

  @SubscribeMessage('dm:typing')
  async onDmTyping(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const user = (client.data as { user: WsUser }).user
    await this.dm.requireMembership(body.conversationId, user.id)
    client.to(`dm:${body.conversationId}`).emit('dm:typing', {
      userId: user.id,
      conversationId: body.conversationId,
      username: user.displayName ?? user.username
    })
    return { ok: true }
  }

  @SubscribeMessage('dm:join')
  async onDmJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const user = (client.data as { user: WsUser }).user
    await this.dm.requireMembership(body.conversationId, user.id)
    client.join(`dm:${body.conversationId}`)
    return { ok: true }
  }

  @SubscribeMessage('channel:join')
  async onChannelJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = (client.data as { user: WsUser }).user
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)
    client.join(`channel:${body.channelId}`)
    return { ok: true }
  }

  @SubscribeMessage('channel:leave')
  async onChannelLeave(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = (client.data as { user: WsUser }).user
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)
    client.leave(`channel:${body.channelId}`)
    return { ok: true }
  }

  @SubscribeMessage('voice:join')
  async onVoiceJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId: string }) {
    const user = (client.data as { user: WsUser }).user
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? []

    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)

    const prev = this.socketVoiceChannel.get(client.id)
    if (prev) {
      this.removeVoiceParticipant(client.id, serverIds)
    }

    let participants = this.voiceParticipants.get(body.channelId)
    if (!participants) {
      participants = new Map()
      this.voiceParticipants.set(body.channelId, participants)
    }
    participants.set(client.id, {
      userId: user.id,
      username: user.displayName ?? user.username
    })
    this.socketVoiceChannel.set(client.id, body.channelId)

    for (const sid of serverIds) {
      this.server.to(`server:${sid}`).emit('voice:participant-joined', {
        channelId: body.channelId,
        userId: user.id,
        username: user.displayName ?? user.username
      })
    }

    return { ok: true }
  }

  @SubscribeMessage('voice:leave')
  async onVoiceLeave(@ConnectedSocket() client: Socket) {
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? []
    this.removeVoiceParticipant(client.id, serverIds)
    return { ok: true }
  }

  @SubscribeMessage('voice:state')
  async onVoiceState(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      muted?: boolean
      deafened?: boolean
      camera?: boolean
      screenShare?: boolean
    }
  ) {
    const user = (client.data as { user: WsUser }).user
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? []
    const channelId = this.socketVoiceChannel.get(client.id)
    if (!channelId) return { ok: false }

    const sanitized: Record<string, boolean> = {}
    for (const key of ['muted', 'deafened', 'camera', 'screenShare'] as const) {
      if (typeof body[key] === 'boolean') sanitized[key] = body[key]
    }

    for (const sid of serverIds) {
      this.server.to(`server:${sid}`).emit('voice:participant-state', {
        channelId,
        userId: user.id,
        ...sanitized
      })
    }
    return { ok: true }
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
  private describePushPreview(
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

  private async sendPushToOfflineMembers(
    serverId: string,
    senderId: string,
    senderName: string,
    content: string | undefined,
    url: string,
    channelId: string,
    mentionedUserIds: string[],
    attachments?: { type: string }[]
  ) {
    const members = await this.prisma.serverMember.findMany({
      where: { serverId, NOT: { userId: senderId } },
      select: { userId: true, notifLevel: true }
    })

    const offlineIds = members.filter((m) => !this.isUserOnline(m.userId))

    if (offlineIds.length === 0) return

    const serverPrefMap = new Map<string, string>()
    for (const m of offlineIds) {
      if (m.notifLevel) serverPrefMap.set(m.userId, m.notifLevel)
    }

    const offlineUserIds = offlineIds.map((m) => m.userId)
    const channelPrefMap = await this.getChannelNotifPrefs(channelId, offlineUserIds)
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

    const preview = this.describePushPreview(content, attachments)
    await this.push.sendToUsers(eligibleIds, {
      title: senderName,
      body: preview,
      url
    })
  }

  private async getChannelNotifPrefs(channelId: string, userIds: string[]): Promise<Map<string, string>> {
    const cacheKey = `notifprefs:${channelId}`
    try {
      const cached = await this.redis.client.hgetall(cacheKey)
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

    const prefs = await this.prisma.channelNotifPref.findMany({
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
        await this.redis.client.hmset(cacheKey, hash)
        await this.redis.client.expire(cacheKey, 300)
      } catch {
        /* best-effort cache */
      }
    }
    return map
  }
}
