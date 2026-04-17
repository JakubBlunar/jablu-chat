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
import {
  IN_APP_NOTIFICATION_USERS_EVENT,
  InAppNotificationsService
} from '../in-app-notifications/in-app-notifications.service'
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
import {
  deliverChannelMessage,
  deliverDmMessage,
  type MessageNotificationsContext
} from './message-notifications'
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

  /**
   * userId -> manual presence (idle / dnd / invisible) with optional wall-clock expiry.
   * `expiresAt: null` means until user picks Online or sets a new status.
   */
  readonly manualPresence = new Map<string, { status: string; expiresAt: Date | null }>()

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
    readonly roles: RolesService,
    private readonly inApp: InAppNotificationsService
  ) {}

  private readonly onInAppNotificationUsers = (data: { userIds: string[] }) => {
    for (const uid of data.userIds) {
      this.server?.to(`user:${uid}`).emit('in_app_notification:new', {})
    }
  }

  onModuleDestroy() {
    this.events.off(IN_APP_NOTIFICATION_USERS_EVENT, this.onInAppNotificationUsers)
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

  private getActiveManualPresence(userId: string): { status: string; expiresAt: Date | null } | undefined {
    const row = this.manualPresence.get(userId)
    if (!row) return undefined
    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) return undefined
    return row
  }

  private hasActiveManualPresence(userId: string): boolean {
    return this.getActiveManualPresence(userId) !== undefined
  }

  private isInvisible(userId: string): boolean {
    return this.getActiveManualPresence(userId)?.status === 'offline'
  }

  /**
   * Presence-style check: true if the user has any live socket OR is inside the
   * 5-minute disconnect grace window. Used for friend list / member list display
   * so brief reconnects don't flicker.
   */
  isUserOnline(userId: string): boolean {
    if (this.isInvisible(userId)) return false
    return this.onlineUsers.has(userId) || this.disconnectGrace.has(userId)
  }

  /**
   * Strict check: true only if the user has at least one live socket. Used for
   * push gating — during the disconnect-grace window the user has no live socket
   * and would not receive WS events, so push must still fire.
   */
  hasActiveSocket(userId: string): boolean {
    if (this.isInvisible(userId)) return false
    return this.onlineUsers.has(userId)
  }

  async getFriendUserIds(userId: string): Promise<string[]> {
    const cacheKey = `friends:${userId}`
    const cached = await this.redis.client.get(cacheKey)
    if (cached) return JSON.parse(cached) as string[]

    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ requesterId: userId }, { addresseeId: userId }]
      },
      select: { requesterId: true, addresseeId: true }
    })
    const ids = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    )
    await this.redis.client.setex(cacheKey, 60, JSON.stringify(ids))
    return ids
  }

  invalidateFriendCache(userA: string, userB: string) {
    void this.redis.client.del(`friends:${userA}`, `friends:${userB}`)
  }

  private emitToFriends(friendIds: string[], event: string, data: unknown) {
    for (const fid of friendIds) {
      this.server.to(`user:${fid}`).emit(event, data)
    }
  }

  getOnlineUserIds(): string[] {
    const ids: string[] = []
    for (const userId of this.onlineUsers.keys()) {
      if (!this.isInvisible(userId)) ids.push(userId)
    }
    for (const userId of this.disconnectGrace.keys()) {
      if (!this.onlineUsers.has(userId) && !this.isInvisible(userId)) {
        ids.push(userId)
      }
    }
    return ids
  }

  afterInit() {
    registerEventListeners(this)
    this.events.on(IN_APP_NOTIFICATION_USERS_EVENT, this.onInAppNotificationUsers)
    this.afkInterval = setInterval(() => void this.checkAfkParticipants(), 30_000)
    this.idleCheckInterval = setInterval(() => void this.runIdleAndManualExpiryChecks(), 60_000)
  }

  private async runIdleAndManualExpiryChecks() {
    await this.checkManualPresenceExpiry()
    await this.checkIdleUsers()
  }

  private async checkManualPresenceExpiry() {
    const now = Date.now()
    const due: string[] = []
    for (const userId of this.onlineUsers.keys()) {
      const raw = this.manualPresence.get(userId)
      if (!raw) continue
      if (raw.expiresAt === null) continue
      if (raw.expiresAt.getTime() > now) continue
      due.push(userId)
    }
    for (const userId of due) {
      await this.clearTimedManualPresenceForOnlineUser(userId)
    }
  }

  private async clearTimedManualPresenceForOnlineUser(userId: string) {
    this.manualPresence.delete(userId)

    const lastActivity = this.userLastActivity.get(userId) ?? Date.now()
    const next: 'online' | 'idle' =
      Date.now() - lastActivity > ChatGateway.IDLE_THRESHOLD_MS ? 'idle' : 'online'
    this.lastBroadcastedStatus.set(userId, next)
    await this.prisma.user
      .update({
        where: { id: userId },
        data: {
          manualStatus: null,
          manualStatusExpiresAt: null,
          status: next
        }
      })
      .catch((err) => this.logger.warn(`Manual presence expiry DB ${userId}`, err?.message))

    const sockets = await this.server.in(`user:${userId}`).fetchSockets()
    const serverIds = new Set<string>()
    for (const s of sockets) {
      for (const sid of (s.data as { serverIds?: string[] }).serverIds ?? []) {
        serverIds.add(sid)
      }
    }
    for (const sid of serverIds) {
      this.server.to(`server:${sid}`).emit('user:status', { userId, status: next })
    }
    const friendIds = await this.getFriendUserIds(userId)
    this.emitToFriends(friendIds, 'user:status', { userId, status: next })
  }

  private async checkAfkParticipants() {
    const now = Date.now()
    const serversCache = new Map<string, { afkChannelId: string | null; afkTimeout: number }>()

    // Pre-load all active voice channel → serverId mappings in one query
    const activeChannelIds = [...this.voiceParticipants.keys()]
    if (activeChannelIds.length === 0) return
    const channelRows = await this.prisma.channel.findMany({
      where: { id: { in: activeChannelIds } },
      select: { id: true, serverId: true },
    })
    const channelServerMap = new Map(channelRows.map((c) => [c.id, c.serverId]))

    for (const [channelId, participants] of this.voiceParticipants) {
      for (const [socketId, participant] of participants) {
        const lastActivity = this.voiceActivity.get(socketId)
        if (!lastActivity) continue

        const serverId = channelServerMap.get(channelId)
        if (!serverId) continue

        let serverConfig = serversCache.get(serverId)
        if (!serverConfig) {
          const server = await this.prisma.server.findUnique({
            where: { id: serverId },
            select: { afkChannelId: true, afkTimeout: true }
          })
          serverConfig = { afkChannelId: server?.afkChannelId ?? null, afkTimeout: server?.afkTimeout ?? 300 }
          serversCache.set(serverId, serverConfig)
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

  private async hydrateManualPresenceFromDb(userId: string): Promise<void> {
    const pu = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { manualStatus: true, manualStatusExpiresAt: true }
    })
    if (!pu?.manualStatus) {
      this.manualPresence.delete(userId)
      return
    }
    if (pu.manualStatusExpiresAt != null && pu.manualStatusExpiresAt <= new Date()) {
      await this.prisma.user
        .update({
          where: { id: userId },
          data: { manualStatus: null, manualStatusExpiresAt: null }
        })
        .catch(() => {})
      this.manualPresence.delete(userId)
      return
    }
    this.manualPresence.set(userId, {
      status: pu.manualStatus,
      expiresAt: pu.manualStatusExpiresAt
    })
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
            channels: { select: { id: true } }
          }
        }
      }
    })

    const serverIds = memberships.map((m) => m.serverId)

    const allMemberUserIds = new Set<string>()
    if (serverIds.length > 0) {
      const memberRows = await this.prisma.serverMember.findMany({
        where: { serverId: { in: serverIds } },
        select: { userId: true }
      })
      for (const r of memberRows) {
        allMemberUserIds.add(r.userId)
      }
    }

    const visibleByServer =
      serverIds.length > 0
        ? await this.roles.getVisibleChannelIdsForServers(user.id, serverIds)
        : new Map<string, string[]>()

    for (const m of memberships) {
      client.join(`server:${m.serverId}`)
      const visibleSet = new Set(visibleByServer.get(m.serverId) ?? [])
      for (const ch of m.server.channels) {
        if (visibleSet.has(ch.id)) {
          client.join(`channel:${ch.id}`)
        }
      }
    }
    ;(client.data as { serverIds?: string[] }).serverIds = serverIds
    client.join(`user:${user.id}`)

    if (!user.isBot) {
      await this.hydrateManualPresenceFromDb(user.id)
    }

    if (user.isBot) {
      const dmConversations = await this.prisma.directConversationMember.findMany({
        where: { userId: user.id },
        select: { conversationId: true }
      })
      for (const dc of dmConversations) {
        client.join(`dm:${dc.conversationId}`)
      }

      const servers = memberships.map((m) => ({
        id: m.serverId,
        name: m.server.name,
        channels: m.server.channels.map((ch) => ({ id: ch.id }))
      }))
      client.emit('bot:ready', {
        user: { id: user.id, username: user.username, displayName: user.displayName },
        servers
      })
      this.addOnlineUser(user.id)
      await this.prisma.user.update({ where: { id: user.id }, data: { status: 'online' } })
      for (const sid of serverIds) {
        this.server.to(`server:${sid}`).emit('user:online', { userId: user.id })
        this.server.to(`server:${sid}`).emit('user:status', { userId: user.id, status: 'online' })
      }
      return
    }

    const pendingGrace = this.disconnectGrace.get(user.id)
    if (pendingGrace) {
      clearTimeout(pendingGrace.timer)
      this.disconnectGrace.delete(user.id)
    }

    const isFirstConnection = this.addOnlineUser(user.id)
    this.userLastActivity.set(user.id, Date.now())

    const isInvisible = this.isInvisible(user.id)

    const friendIds = await this.getFriendUserIds(user.id)

    if (pendingGrace) {
      if (isInvisible) {
        // Reconnecting during grace while invisible -- stay invisible, no broadcast
      } else {
        const manualSt = this.getActiveManualPresence(user.id)?.status
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
      if (isInvisible) {
        this.lastBroadcastedStatus.set(user.id, 'offline')
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastSeenAt: new Date() }
        })
      } else if (this.hasActiveManualPresence(user.id)) {
        const st = this.getActiveManualPresence(user.id)!.status as 'online' | 'idle' | 'dnd' | 'offline'
        this.lastBroadcastedStatus.set(user.id, st)
        await this.prisma.user.update({
          where: { id: user.id },
          data: { status: st, lastSeenAt: new Date() }
        })
        for (const sid of serverIds) {
          this.server.to(`server:${sid}`).emit('user:online', { userId: user.id })
          this.server.to(`server:${sid}`).emit('user:status', { userId: user.id, status: st })
        }
        this.emitToFriends(friendIds, 'user:online', { userId: user.id })
        this.emitToFriends(friendIds, 'user:status', { userId: user.id, status: st })
      } else {
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

      const markOffline = async () => {
        this.disconnectGrace.delete(userId)
        if (this.onlineUsers.has(userId)) return
        this.userLastActivity.delete(userId)
        this.manualPresence.delete(userId)
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
      }

      if (user.isBot) {
        void markOffline()
      } else {
        const timer = setTimeout(markOffline, ChatGateway.DISCONNECT_GRACE_MS)
        this.disconnectGrace.set(userId, { timer, serverIds: capturedServerIds })
      }
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

    if (serverId) {
      await deliverChannelMessage(this.messageNotificationsContext(), {
        serverId,
        channelId: body.channelId,
        message: {
          ...msgRest,
          threadParentId: body.threadParentId ?? null
        },
        senderId: user.id,
        threadUpdate
      })
    } else {
      this.emitToChannel(body.channelId, 'message:new', {
        ...msgRest,
        mentionedUserIds: [],
        mentionEveryone: false,
        mentionHere: false
      })
    }

    if (body.content?.startsWith('/') && serverId) {
      void this.routeSlashCommand(body.content, serverId, body.channelId, user, client, body.targetBotAppId)
    }

    return { ok: true, message: msgRest }
  }

  private async routeSlashCommand(
    content: string,
    serverId: string,
    channelId: string,
    user: WsUser,
    client: Socket,
    targetBotAppId?: string
  ) {
    try {
      const parts = content.slice(1).split(/\s+/)
      const commandName = parts[0]?.toLowerCase()
      if (!commandName) return

      const argsString = parts.slice(1).join(' ')

      let match: { userId: string; commands: { parameters: unknown; requiredPermission: string | null }[] } | undefined

      if (targetBotAppId) {
        const targeted = await this.prisma.botApplication.findUnique({
          where: { id: targetBotAppId },
          include: { commands: { where: { name: commandName } } }
        })
        if (targeted && targeted.commands.length > 0) match = targeted
      }

      if (!match) {
        const botMembers = await this.prisma.serverMember.findMany({
          where: { serverId, user: { isBot: true } },
          select: { userId: true }
        })
        if (botMembers.length === 0) return

        const botApps = await this.prisma.botApplication.findMany({
          where: { userId: { in: botMembers.map((m) => m.userId) } },
          include: { commands: { where: { name: commandName } }, user: { select: { username: true } } },
          orderBy: { user: { username: 'asc' } }
        })
        match = botApps.find((app) => app.commands.length > 0)
        if (!match) return
      }

      const command = match.commands[0]!

      if (command.requiredPermission) {
        const permFlag = Permission[command.requiredPermission as keyof typeof Permission]
        if (!permFlag) {
          client.emit('bot:command-error', { error: 'This command has an invalid permission requirement', channelId })
          return
        }
        try {
          const userPerms = await this.roles.getChannelPermissions(serverId, channelId, user.id)
          if (!hasPermission(userPerms, permFlag)) {
            client.emit('bot:command-error', { error: `You need the ${command.requiredPermission.replace(/_/g, ' ').toLowerCase()} permission to use this command`, channelId })
            return
          }
        } catch {
          client.emit('bot:command-error', { error: 'Could not verify your permissions', channelId })
          return
        }
      }

      const botParams = (command.parameters as any[]) ?? []
      const args: Record<string, string> = {}
      if (botParams.length > 0 && argsString) {
        if (botParams.length === 1) {
          args[botParams[0].name] = argsString
        } else {
          const argParts = argsString.split(/\s+/)
          botParams.forEach((p: any, i: number) => {
            if (argParts[i]) args[p.name] = argParts[i]
          })
        }
      }

      const botSocket = await this.findBotSocket(match.userId)
      if (!botSocket) {
        client.emit('bot:command-error', { error: 'Bot is currently offline', channelId })
        return
      }

      const hasSendPerm = await this.checkBotChannelPermission(serverId, channelId, match.userId)
      if (!hasSendPerm) {
        client.emit('bot:command-error', { error: 'Bot does not have permission to respond in this channel', channelId })
        return
      }

      let userPermissions: string | undefined
      try {
        const perms = await this.roles.getChannelPermissions(serverId, channelId, user.id)
        userPermissions = perms.toString()
      } catch { /* best-effort */ }

      botSocket.emit('bot:command', {
        serverId,
        channelId,
        commandName,
        args,
        user: { id: user.id, username: user.username, displayName: user.displayName },
        userPermissions
      })
    } catch (err) {
      this.logger.warn('Slash command routing failed', (err as Error)?.message)
      client.emit('bot:command-error', { error: 'Something went wrong running this command', channelId })
    }
  }

  private async findBotSocket(botUserId: string): Promise<Socket | null> {
    const sockets = await this.server.in(`user:${botUserId}`).fetchSockets()
    for (const s of sockets) {
      const data = s.data as { user?: WsUser }
      if (data.user?.isBot) return s as unknown as Socket
    }
    return null
  }

  private async routeDmSlashCommand(
    content: string,
    conversationId: string,
    memberIds: string[],
    user: WsUser,
    client: Socket,
    targetBotAppId?: string
  ) {
    try {
      const parts = content.slice(1).split(/\s+/)
      const commandName = parts[0]?.toLowerCase()
      if (!commandName) return

      const argsString = parts.slice(1).join(' ')

      let botApp: { userId: string; commands: { parameters: unknown }[] } | null = null

      if (targetBotAppId) {
        const targeted = await this.prisma.botApplication.findUnique({
          where: { id: targetBotAppId },
          include: { commands: { where: { name: commandName } } }
        })
        if (targeted && targeted.commands.length > 0 && memberIds.includes(targeted.userId)) {
          botApp = targeted
        }
      }

      if (!botApp) {
        const otherMembers = memberIds.filter((id) => id !== user.id)
        if (otherMembers.length === 0) return

        const botUser = await this.prisma.user.findFirst({
          where: { id: { in: otherMembers }, isBot: true }
        })
        if (!botUser) return

        const found = await this.prisma.botApplication.findUnique({
          where: { userId: botUser.id },
          include: { commands: { where: { name: commandName } } }
        })
        if (!found || found.commands.length === 0) return
        botApp = found
      }

      if (!botApp) return

      const command = botApp.commands[0]!
      const botParams = (command.parameters as any[]) ?? []
      const args: Record<string, string> = {}
      if (botParams.length > 0 && argsString) {
        if (botParams.length === 1) {
          args[botParams[0].name] = argsString
        } else {
          const argParts = argsString.split(/\s+/)
          botParams.forEach((p: any, i: number) => {
            if (argParts[i]) args[p.name] = argParts[i]
          })
        }
      }

      const botSocket = await this.findBotSocket(botApp.userId)
      if (!botSocket) {
        client.emit('bot:command-error', { error: 'Bot is currently offline', channelId: conversationId })
        return
      }

      botSocket.emit('bot:command', {
        conversationId,
        channelId: conversationId,
        commandName,
        args,
        user: { id: user.id, username: user.username, displayName: user.displayName }
      })
    } catch (err) {
      this.logger.warn('DM slash command routing failed', (err as Error)?.message)
    }
  }

  private async checkBotChannelPermission(serverId: string, channelId: string, botUserId: string): Promise<boolean> {
    try {
      const perms = await this.roles.getChannelPermissions(serverId, channelId, botUserId)
      return hasPermission(perms, Permission.SEND_MESSAGES) && hasPermission(perms, Permission.VIEW_CHANNEL)
    } catch {
      return false
    }
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
    if (this.hasActiveManualPresence(user.id)) return { ok: true }

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
      if (this.hasActiveManualPresence(userId)) continue

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

    await deliverDmMessage(this.messageNotificationsContext(), {
      conversationId: body.conversationId,
      message: msg,
      senderId: user.id
    })

    if (body.content?.startsWith('/')) {
      void this.routeDmSlashCommand(body.content, body.conversationId, memberIds, user, client, body.targetBotAppId)
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

  /** Built once per call; captures gateway state needed by the unified delivery helpers. */
  messageNotificationsContext(): MessageNotificationsContext {
    return {
      prisma: this.prisma,
      push: this.push,
      redis: this.redis,
      roles: this.roles,
      inApp: this.inApp,
      readState: this.readState,
      linkPreviews: this.linkPreviews,
      dm: this.dm,
      hasActiveSocket: this.hasActiveSocket.bind(this),
      getOnlineUserIds: this.getOnlineUserIds.bind(this),
      emitToChannel: this.emitToChannel.bind(this),
      emitToDm: this.emitToDm.bind(this),
      logger: this.logger
    }
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
        isUserOnline: this.hasActiveSocket.bind(this)
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
        isUserOnline: this.hasActiveSocket.bind(this)
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
