import { Logger, OnModuleDestroy, UseFilters, UseGuards } from '@nestjs/common'
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
import { Permission, hasPermission } from '@chat/shared'
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
import { RolesService } from '../roles/roles.service'
import { registerEventListeners } from './gateway-event-listeners'
import {
  WsChannelIdDto,
  WsConversationIdDto,
  WsDmEditDto,
  WsDmMessageDto,
  WsDmSendDto,
  WsEditMessageDto,
  WsMessageChannelDto,
  WsMessageIdDto,
  WsPollVoteDto,
  WsReactionToggleDto,
  WsSendMessageDto,
  WsVoiceStateDto
} from './gateway.dto'
import {
  describePushPreview as describePushPreviewText,
  sendPushToOfflineMembers as sendPushToOfflineMembersWithCtx,
  sendPushToThreadParticipants as sendPushToThreadParticipantsWithCtx
} from './gateway-push-helpers'
import { WsExceptionFilter } from './ws-exception.filter'
import { WsJwtGuard, WsUser } from './ws-jwt.guard'
import { WsThrottle, WsThrottleGuard } from './ws-throttle.guard'

@WebSocketGateway({ namespace: '/' })
@UseGuards(WsJwtGuard, WsThrottleGuard)
@UseFilters(WsExceptionFilter)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatGateway.name)

  @WebSocketServer()
  server!: Server

  /** userId -> number of active socket connections */
  private readonly onlineUsers = new Map<string, number>()

  /** userId -> manually chosen status (idle/dnd/offline) that should not be overridden by auto-detection */
  readonly manualStatus = new Map<string, string>()

  /** userId -> last activity timestamp (ms) from any of their sockets */
  private readonly userLastActivity = new Map<string, number>()

  /** channelId -> Set of participants in voice channel */
  private readonly voiceParticipants = new Map<string, Map<string, { userId: string; username: string }>>()

  /** socketId -> channelId the socket is in (for cleanup on disconnect) */
  private readonly socketVoiceChannel = new Map<string, string>()

  /** userId -> pending offline timer + captured serverIds (grace period before marking offline) */
  private readonly disconnectGrace = new Map<string, { timer: NodeJS.Timeout; serverIds: string[] }>()

  /** socketId -> last voice activity timestamp (for AFK detection) */
  private readonly voiceActivity = new Map<string, number>()

  private afkInterval: NodeJS.Timeout | null = null
  private idleCheckInterval: NodeJS.Timeout | null = null

  private static readonly DISCONNECT_GRACE_MS = 5 * 60 * 1000
  private static readonly IDLE_THRESHOLD_MS = 3 * 60 * 1000

  constructor(
    readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly polls: PollsService,
    private readonly automod: AutoModService,
    private readonly dm: DmService,
    private readonly linkPreviews: LinkPreviewService,
    private readonly wsJwtGuard: WsJwtGuard,
    readonly events: EventBusService,
    private readonly readState: ReadStateService,
    readonly push: PushService,
    private readonly redis: RedisService,
    readonly roles: RolesService
  ) {}

  onModuleDestroy() {
    for (const { timer } of this.disconnectGrace.values()) {
      clearTimeout(timer)
    }
    this.disconnectGrace.clear()
    if (this.afkInterval) {
      clearInterval(this.afkInterval)
      this.afkInterval = null
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = null
    }
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

  isUserOnline(userId: string): boolean {
    if (this.manualStatus.get(userId) === 'offline') return false
    return this.onlineUsers.has(userId) || this.disconnectGrace.has(userId)
  }

  async getFriendUserIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ requesterId: userId }, { addresseeId: userId }]
      },
      select: { requesterId: true, addresseeId: true }
    })
    return friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    )
  }

  private emitToFriends(friendIds: string[], event: string, data: unknown) {
    for (const fid of friendIds) {
      this.server.to(`user:${fid}`).emit(event, data)
    }
  }

  getOnlineUserIds(): string[] {
    const ids: string[] = []
    for (const userId of this.onlineUsers.keys()) {
      if (this.manualStatus.get(userId) !== 'offline') ids.push(userId)
    }
    for (const userId of this.disconnectGrace.keys()) {
      if (!this.onlineUsers.has(userId) && this.manualStatus.get(userId) !== 'offline') {
        ids.push(userId)
      }
    }
    return ids
  }

  afterInit() {
    registerEventListeners(this)
    this.afkInterval = setInterval(() => void this.checkAfkParticipants(), 30_000)
    this.idleCheckInterval = setInterval(() => void this.checkIdleUsers(), 60_000)
  }

  private async checkAfkParticipants() {
    const now = Date.now()
    const serversCache = new Map<string, { afkChannelId: string | null; afkTimeout: number }>()

    for (const [channelId, participants] of this.voiceParticipants) {
      for (const [socketId, participant] of participants) {
        const lastActivity = this.voiceActivity.get(socketId)
        if (!lastActivity) continue

        const channel = await this.prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true }
        })
        if (!channel) continue

        let serverConfig = serversCache.get(channel.serverId)
        if (!serverConfig) {
          const server = await this.prisma.server.findUnique({
            where: { id: channel.serverId },
            select: { afkChannelId: true, afkTimeout: true }
          })
          serverConfig = { afkChannelId: server?.afkChannelId ?? null, afkTimeout: server?.afkTimeout ?? 300 }
          serversCache.set(channel.serverId, serverConfig)
        }

        if (!serverConfig.afkChannelId || channelId === serverConfig.afkChannelId) continue
        if (now - lastActivity < serverConfig.afkTimeout * 1000) continue

        // Move user to AFK channel
        const afkChannelId = serverConfig.afkChannelId
        participants.delete(socketId)
        if (participants.size === 0) this.voiceParticipants.delete(channelId)

        let afkParticipants = this.voiceParticipants.get(afkChannelId)
        if (!afkParticipants) {
          afkParticipants = new Map()
          this.voiceParticipants.set(afkChannelId, afkParticipants)
        }
        afkParticipants.set(socketId, participant)
        this.socketVoiceChannel.set(socketId, afkChannelId)
        this.voiceActivity.set(socketId, now)

        this.server.to(`channel:${channelId}`).emit('voice:participant-left', { channelId, userId: participant.userId })
        this.server.to(`channel:${afkChannelId}`).emit('voice:participant-joined', {
          channelId: afkChannelId,
          userId: participant.userId,
          username: participant.username
        })

        this.server.to(`user:${participant.userId}`).emit('voice:moved', {
          userId: participant.userId,
          fromChannelId: channelId,
          toChannelId: afkChannelId
        })
      }
    }
  }

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data)
  }

  emitToDm(conversationId: string, event: string, data: unknown) {
    this.server.to(`dm:${conversationId}`).emit(event, data)
  }

  async getVisibleChannelIds(serverId: string, userId: string): Promise<string[]> {
    const permMap = await this.roles.getAllChannelPermissions(serverId, userId)
    const VIEW = Permission.VIEW_CHANNEL
    return Object.entries(permMap)
      .filter(([, perms]) => hasPermission(perms, VIEW))
      .map(([chId]) => chId)
  }

  async reconcileChannelRooms(serverId: string, userId: string) {
    const visibleIds = new Set(await this.getVisibleChannelIds(serverId, userId))
    const allChannels = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    })
    const userSockets = await this.server.in(`user:${userId}`).fetchSockets()
    for (const s of userSockets) {
      for (const ch of allChannels) {
        const room = `channel:${ch.id}`
        if (visibleIds.has(ch.id)) {
          s.join(room)
        } else {
          s.leave(room)
        }
      }
    }
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
      const visibleChannelIds = await this.getVisibleChannelIds(m.serverId, user.id)
      const visibleSet = new Set(visibleChannelIds)
      for (const ch of m.server.channels) {
        if (visibleSet.has(ch.id)) {
          client.join(`channel:${ch.id}`)
        }
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
    this.userLastActivity.set(user.id, Date.now())

    const isInvisible = this.manualStatus.get(user.id) === 'offline'

    const friendIds = await this.getFriendUserIds(user.id)

    if (pendingGrace) {
      if (isInvisible) {
        // Reconnecting during grace while invisible -- stay invisible, no broadcast
      } else {
        const manualSt = this.manualStatus.get(user.id)
        const status = (manualSt ?? 'online') as 'online' | 'idle' | 'dnd' | 'offline'
        if (this.lastBroadcastedStatus.get(user.id) !== status) {
          this.lastBroadcastedStatus.set(user.id, status)
          await this.prisma.user.update({
            where: { id: user.id },
            data: { status }
          })
          for (const sid of serverIds) {
            this.server.to(`server:${sid}`).emit('user:status', { userId: user.id, status })
          }
          this.emitToFriends(friendIds, 'user:status', { userId: user.id, status })
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
      this.emitToFriends(friendIds, 'user:online', { userId: user.id })
      this.emitToFriends(friendIds, 'user:status', { userId: user.id, status: 'online' })
    }

    const onlineNow = this.getOnlineUserIds().filter((id) => allMemberUserIds.has(id))
    client.emit('presence:init', { onlineUserIds: onlineNow })

    const onlineFriendIds = friendIds.filter((fid) => this.isUserOnline(fid))
    const friendStatuses: Record<string, string> = {}
    for (const fid of onlineFriendIds) {
      friendStatuses[fid] = this.lastBroadcastedStatus.get(fid) ?? 'online'
    }
    client.emit('friends:presence', { onlineFriendIds, friendStatuses })

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

    if (isLastConnection) {
      const capturedServerIds = [...serverIds]
      const userId = user.id
      const timer = setTimeout(async () => {
        this.disconnectGrace.delete(userId)
        if (this.onlineUsers.has(userId)) return
        this.userLastActivity.delete(userId)
        this.manualStatus.delete(userId)
        this.lastBroadcastedStatus.delete(userId)
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'offline', lastSeenAt: new Date() }
        })
        for (const sid of capturedServerIds) {
          this.server.to(`server:${sid}`).emit('user:offline', { userId })
        }
        const friendIds = await this.getFriendUserIds(userId)
        this.emitToFriends(friendIds, 'user:offline', { userId })
      }, ChatGateway.DISCONNECT_GRACE_MS)
      this.disconnectGrace.set(userId, { timer, serverIds: capturedServerIds })
    }
  }

  private removeVoiceParticipant(socketId: string, serverIds?: string[]) {
    const channelId = this.socketVoiceChannel.get(socketId)
    if (!channelId) return

    this.socketVoiceChannel.delete(socketId)
    this.voiceActivity.delete(socketId)
    const participants = this.voiceParticipants.get(channelId)
    if (!participants) return

    const leaving = participants.get(socketId)
    participants.delete(socketId)
    if (participants.size === 0) {
      this.voiceParticipants.delete(channelId)
    }

    if (leaving) {
      this.server.to(`channel:${channelId}`).emit('voice:participant-left', {
        channelId,
        userId: leaving.userId
      })
    }
  }

  private async assertNotArchived(channelId: string) {
    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { isArchived: true }
    })
    if (ch?.isArchived) {
      return { archived: true as const }
    }
    return { archived: false as const }
  }

  private async assertCanSendInChannel(channelId: string, userId: string): Promise<{ denied: boolean; serverId?: string; muted?: boolean }> {
    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true }
    })
    if (!ch) return { denied: false }
    try {
      await this.roles.requireChannelPermission(ch.serverId, channelId, userId, Permission.SEND_MESSAGES)
    } catch {
      return { denied: true, serverId: ch.serverId }
    }
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: ch.serverId } },
      select: { mutedUntil: true }
    })
    if (member?.mutedUntil && member.mutedUntil > new Date()) {
      return { denied: true, serverId: ch.serverId, muted: true }
    }
    return { denied: false, serverId: ch.serverId }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsSendMessageDto
  ) {
    const user = (client.data as { user: WsUser }).user

    if (this.socketVoiceChannel.has(client.id)) this.voiceActivity.set(client.id, Date.now())

    const archiveCheck = await this.assertNotArchived(body.channelId)
    if (archiveCheck.archived) {
      return { ok: false, error: 'This channel is archived' }
    }

    const sendCheck = await this.assertCanSendInChannel(body.channelId, user.id)
    if (sendCheck.denied) {
      return { ok: false, error: sendCheck.muted ? 'You are timed out in this server' : 'You do not have permission to send messages in this channel' }
    }

    if (body.content && sendCheck.serverId) {
      const check = await this.automod.checkMessage(sendCheck.serverId, user.id, body.content, { channelId: body.channelId })
      if (!check.allowed) {
        return { ok: false, error: check.reason ?? 'Message blocked by auto-moderation' }
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
      mentionEveryone = result.everyone
      mentionHere = result.here

      const filtered: string[] = []
      for (const uid of result.userIds) {
        try {
          const perms = await this.roles.getChannelPermissions(serverId, body.channelId, uid)
          if (hasPermission(perms, Permission.VIEW_CHANNEL)) {
            filtered.push(uid)
          }
        } catch { /* not a member, skip */ }
      }
      mentionedUserIds = filtered

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
        lastThreadReply: {
          content: msgRest.content ?? null,
          author: msgRest.author ?? null,
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

    if (serverId && !body.threadParentId) {
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

    if (threadUpdate && serverId) {
      this.sendPushToThreadParticipants(
        threadUpdate.parentId,
        body.channelId,
        serverId,
        user.id,
        msgRest.author?.displayName ?? msgRest.author?.username ?? 'Someone',
        body.content,
        msgRest.attachments
      ).catch((err) => this.logger.warn('Thread push notification failed', err?.message))
    }

    return { ok: true, message: msgRest }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('message:edit')
  async onMessageEdit(@ConnectedSocket() client: Socket, @MessageBody() body: WsEditMessageDto) {
    const user = (client.data as { user: WsUser }).user

    if (body.content) {
      const channelId = await this.messages.getMessageChannelId(body.messageId)
      if (channelId) {
        const channel = await this.prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true }
        })
        if (channel?.serverId) {
          const check = await this.automod.checkMessage(channel.serverId, user.id, body.content, { channelId, messageId: body.messageId })
          if (!check.allowed) {
            return { ok: false, error: check.reason ?? 'Edit blocked by auto-moderation' }
          }
        }
      }
    }

    const updated = await this.messages.editMessage(body.messageId, user.id, body.content)
    const channelId = updated.channelId
    if (channelId) {
      this.emitToChannel(channelId, 'message:edit', updated)
    }
    return { ok: true, message: updated }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('message:delete')
  async onMessageDelete(@ConnectedSocket() client: Socket, @MessageBody() body: WsMessageIdDto) {
    const user = (client.data as { user: WsUser }).user
    const meta = await this.prisma.message.findUnique({
      where: { id: body.messageId },
      select: { channelId: true, threadParentId: true }
    })
    const channelId = meta?.channelId ?? null
    await this.messages.deleteMessage(body.messageId, user.id)
    if (channelId) {
      this.emitToChannel(channelId, 'message:delete', {
        messageId: body.messageId,
        channelId
      })
      if (meta?.threadParentId) {
        const threadCount = await this.prisma.message.count({
          where: { threadParentId: meta.threadParentId, deleted: false }
        })
        const lastReply = await this.prisma.message.findFirst({
          where: { threadParentId: meta.threadParentId, deleted: false },
          orderBy: { createdAt: 'desc' },
          select: {
            content: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        })
        this.emitToChannel(channelId, 'message:thread-update', {
          parentId: meta.threadParentId,
          threadCount,
          lastThreadReply: lastReply
            ? {
                content: lastReply.content ?? null,
                author: lastReply.author ?? null,
                createdAt: lastReply.createdAt
              }
            : undefined
        })
      }
    }
    return { ok: true }
  }

  @WsThrottle(10, 10)
  @SubscribeMessage('reaction:toggle')
  async onReactionToggle(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsReactionToggleDto
  ) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.prisma.message.findUnique({ where: { id: body.messageId }, select: { channelId: true } })
    if (msg?.channelId) {
      const archiveCheck = await this.assertNotArchived(msg.channelId)
      if (archiveCheck.archived) return { ok: false, error: 'This channel is archived' }
      const sendCheck = await this.assertCanSendInChannel(msg.channelId, user.id)
      if (sendCheck.denied) return { ok: false, error: 'You do not have permission to interact in this channel' }
    }
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

  @WsThrottle(5, 10)
  @SubscribeMessage('message:pin')
  async onMessagePin(@ConnectedSocket() client: Socket, @MessageBody() body: WsMessageChannelDto) {
    const user = (client.data as { user: WsUser }).user
    const archiveCheck = await this.assertNotArchived(body.channelId)
    if (archiveCheck.archived) return { ok: false, error: 'This channel is archived' }
    const msg = await this.messages.pinMessage(body.messageId, user.id, body.channelId)
    this.emitToChannel(body.channelId, 'message:pin', msg)
    return { ok: true, message: msg }
  }

  @WsThrottle(5, 10)
  @SubscribeMessage('message:unpin')
  async onMessageUnpin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsMessageChannelDto
  ) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.messages.unpinMessage(body.messageId, user.id, body.channelId)
    this.emitToChannel(body.channelId, 'message:unpin', msg)
    return { ok: true, message: msg }
  }

  @WsThrottle(5, 10)
  @SubscribeMessage('poll:vote')
  async onPollVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsPollVoteDto
  ) {
    const user = (client.data as { user: WsUser }).user
    const result = await this.polls.votePoll(body.pollId, body.optionId, user.id)
    if (result.channelId) {
      this.emitToChannel(result.channelId, 'poll:vote', result.poll)
    }
    return { ok: true, poll: result.poll }
  }

  /** userId -> last broadcasted effective status, avoids redundant DB writes */
  private readonly lastBroadcastedStatus = new Map<string, string>()

  @WsThrottle(2, 5)
  @SubscribeMessage('activity:heartbeat')
  async onActivityHeartbeat(@ConnectedSocket() client: Socket) {
    const user = (client.data as { user: WsUser }).user
    if (this.manualStatus.has(user.id)) return { ok: true }

    this.userLastActivity.set(user.id, Date.now())

    if (this.lastBroadcastedStatus.get(user.id) === 'idle') {
      this.lastBroadcastedStatus.set(user.id, 'online')
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'online' }
      })
      const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? []
      for (const sid of serverIds) {
        this.server.to(`server:${sid}`).emit('user:status', { userId: user.id, status: 'online' })
      }
      const friendIds = await this.getFriendUserIds(user.id)
      this.emitToFriends(friendIds, 'user:status', { userId: user.id, status: 'online' })
    }
    return { ok: true }
  }

  private async checkIdleUsers() {
    const now = Date.now()

    for (const [userId] of this.onlineUsers) {
      if (this.manualStatus.has(userId)) continue

      const lastActivity = this.userLastActivity.get(userId)
      if (!lastActivity) continue

      if (now - lastActivity > ChatGateway.IDLE_THRESHOLD_MS && this.lastBroadcastedStatus.get(userId) !== 'idle') {
        this.lastBroadcastedStatus.set(userId, 'idle')
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'idle' }
        }).catch((err) => this.logger.warn(`Failed to set idle status for ${userId}`, err?.message))

        const sockets = await this.server.in(`user:${userId}`).fetchSockets()
        const serverIds = new Set<string>()
        for (const s of sockets) {
          for (const sid of ((s.data as { serverIds?: string[] }).serverIds ?? [])) {
            serverIds.add(sid)
          }
        }
        for (const sid of serverIds) {
          this.server.to(`server:${sid}`).emit('user:status', { userId, status: 'idle' })
        }
        const friendIds = await this.getFriendUserIds(userId)
        this.emitToFriends(friendIds, 'user:status', { userId, status: 'idle' })
      }
    }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('typing:start')
  async onTypingStart(@ConnectedSocket() client: Socket, @MessageBody() body: WsChannelIdDto) {
    const user = (client.data as { user: WsUser }).user
    const archiveCheck = await this.assertNotArchived(body.channelId)
    if (archiveCheck.archived) return { ok: false }
    const sendCheck = await this.assertCanSendInChannel(body.channelId, user.id)
    if (sendCheck.denied) return { ok: false }
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)
    this.emitToChannel(body.channelId, 'user:typing', {
      userId: user.id,
      channelId: body.channelId,
      username: user.displayName ?? user.username
    })
    return { ok: true }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('typing:stop')
  async onTypingStop(@ConnectedSocket() client: Socket, @MessageBody() body: WsChannelIdDto) {
    const user = (client.data as { user: WsUser }).user
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)
    this.emitToChannel(body.channelId, 'user:typing-stop', {
      userId: user.id,
      channelId: body.channelId
    })
    return { ok: true }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('dm:send')
  async onDmSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsDmSendDto
  ) {
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

  @WsThrottle(5, 5)
  @SubscribeMessage('dm:edit')
  async onDmEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsDmEditDto
  ) {
    const user = (client.data as { user: WsUser }).user
    const updated = await this.dm.editMessage(body.conversationId, body.messageId, user.id, body.content)
    this.emitToDm(body.conversationId, 'dm:edit', {
      ...updated,
      conversationId: body.conversationId
    })
    return { ok: true, message: updated }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('dm:delete')
  async onDmDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsDmMessageDto
  ) {
    const user = (client.data as { user: WsUser }).user
    await this.dm.deleteMessage(body.conversationId, body.messageId, user.id)
    this.emitToDm(body.conversationId, 'dm:delete', {
      messageId: body.messageId,
      conversationId: body.conversationId
    })
    return { ok: true }
  }

  @WsThrottle(5, 10)
  @SubscribeMessage('dm:pin')
  async onDmPin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsDmMessageDto
  ) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.dm.pinMessage(body.conversationId, body.messageId, user.id)
    this.emitToDm(body.conversationId, 'dm:pin', {
      ...msg,
      conversationId: body.conversationId
    })
    return { ok: true, message: msg }
  }

  @WsThrottle(5, 10)
  @SubscribeMessage('dm:unpin')
  async onDmUnpin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsDmMessageDto
  ) {
    const user = (client.data as { user: WsUser }).user
    const msg = await this.dm.unpinMessage(body.conversationId, body.messageId, user.id)
    this.emitToDm(body.conversationId, 'dm:unpin', {
      ...msg,
      conversationId: body.conversationId
    })
    return { ok: true, message: msg }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('dm:typing')
  async onDmTyping(@ConnectedSocket() client: Socket, @MessageBody() body: WsConversationIdDto) {
    const user = (client.data as { user: WsUser }).user
    await this.dm.requireMembership(body.conversationId, user.id)
    client.to(`dm:${body.conversationId}`).emit('dm:typing', {
      userId: user.id,
      conversationId: body.conversationId,
      username: user.displayName ?? user.username
    })
    return { ok: true }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('dm:typing-stop')
  async onDmTypingStop(@ConnectedSocket() client: Socket, @MessageBody() body: WsConversationIdDto) {
    const user = (client.data as { user: WsUser }).user
    await this.dm.requireMembership(body.conversationId, user.id)
    client.to(`dm:${body.conversationId}`).emit('dm:typing-stop', {
      userId: user.id,
      conversationId: body.conversationId
    })
    return { ok: true }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('dm:join')
  async onDmJoin(@ConnectedSocket() client: Socket, @MessageBody() body: WsConversationIdDto) {
    const user = (client.data as { user: WsUser }).user
    await this.dm.requireMembership(body.conversationId, user.id)
    client.join(`dm:${body.conversationId}`)
    return { ok: true }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('channel:join')
  async onChannelJoin(@ConnectedSocket() client: Socket, @MessageBody() body: WsChannelIdDto) {
    const user = (client.data as { user: WsUser }).user
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)
    client.join(`channel:${body.channelId}`)
    return { ok: true }
  }

  @WsThrottle(5, 5)
  @SubscribeMessage('channel:leave')
  async onChannelLeave(@ConnectedSocket() client: Socket, @MessageBody() body: WsChannelIdDto) {
    const user = (client.data as { user: WsUser }).user
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id)
    client.leave(`channel:${body.channelId}`)
    return { ok: true }
  }

  @WsThrottle(10, 10)
  @SubscribeMessage('voice:join')
  async onVoiceJoin(@ConnectedSocket() client: Socket, @MessageBody() body: WsChannelIdDto) {
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
    this.voiceActivity.set(client.id, Date.now())

    this.server.to(`channel:${body.channelId}`).emit('voice:participant-joined', {
      channelId: body.channelId,
      userId: user.id,
      username: user.displayName ?? user.username
    })

    return { ok: true }
  }

  @WsThrottle(10, 10)
  @SubscribeMessage('voice:leave')
  async onVoiceLeave(@ConnectedSocket() client: Socket) {
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? []
    this.removeVoiceParticipant(client.id, serverIds)
    return { ok: true }
  }

  @WsThrottle(10, 10)
  @SubscribeMessage('voice:state')
  async onVoiceState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WsVoiceStateDto
  ) {
    const user = (client.data as { user: WsUser }).user
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? []
    const channelId = this.socketVoiceChannel.get(client.id)
    if (!channelId) return { ok: false }

    const sanitized: Record<string, boolean> = {}
    for (const key of ['muted', 'deafened', 'camera', 'screenShare'] as const) {
      if (typeof body[key] === 'boolean') sanitized[key] = body[key]
    }

    if (!sanitized.muted) this.voiceActivity.set(client.id, Date.now())

    this.server.to(`channel:${channelId}`).emit('voice:participant-state', {
      channelId,
      userId: user.id,
      ...sanitized
    })
    return { ok: true }
  }

  describePushPreview(content: string | undefined, attachments?: { type: string }[]): string {
    return describePushPreviewText(content, attachments)
  }

  async sendPushToOfflineMembers(
    serverId: string,
    senderId: string,
    senderName: string,
    content: string | undefined,
    url: string,
    channelId: string,
    mentionedUserIds: string[],
    attachments?: { type: string }[]
  ) {
    return sendPushToOfflineMembersWithCtx(
      {
        prisma: this.prisma,
        push: this.push,
        redis: this.redis,
        roles: this.roles,
        isUserOnline: this.isUserOnline.bind(this)
      },
      serverId,
      senderId,
      senderName,
      content,
      url,
      channelId,
      mentionedUserIds,
      attachments
    )
  }

  async sendPushToThreadParticipants(
    parentId: string,
    channelId: string,
    serverId: string,
    senderId: string,
    senderName: string,
    content: string | undefined,
    attachments?: { type: string }[]
  ) {
    return sendPushToThreadParticipantsWithCtx(
      {
        prisma: this.prisma,
        push: this.push,
        redis: this.redis,
        roles: this.roles,
        isUserOnline: this.isUserOnline.bind(this)
      },
      parentId,
      channelId,
      serverId,
      senderId,
      senderName,
      content,
      attachments
    )
  }
}
