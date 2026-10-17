import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { DmCall, DmCallEndReason } from '@chat/shared'
import { getDmCallUrl } from '@chat/shared'
import { InAppNotificationKind } from '../prisma-client'
import { NotificationsService } from '../notifications/notifications.service'
import { DmService } from '../dm/dm.service'
import { PrismaService } from '../prisma/prisma.service'
import { VoiceService } from './voice.service'
import { EventBusService } from '../events/event-bus.service'

type CallSession = {
  call: DmCall
  memberIds: string[]
  sockets: Map<string, DmCall['participants'][number]>
  timer: ReturnType<typeof setTimeout>
}

@Injectable()
export class DmCallsService implements OnModuleDestroy {
  private readonly logger = new Logger(DmCallsService.name)
  private readonly sessions = new Map<string, CallSession>()
  private emit: (userIds: string[], event: string, payload: unknown) => void = () => {
    throw new Error('DM call signaling is not initialized')
  }

  constructor(
    private readonly dm: DmService,
    private readonly prisma: PrismaService,
    private readonly voice: VoiceService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBusService
  ) {
    this.events.on('dm:members-changed', this.onMembersChanged)
  }

  private readonly onMembersChanged = ({ conversationId, userIds, removedUserId }: {
    conversationId: string; userIds: string[]; removedUserId?: string
  }) => {
    for (const session of this.sessions.values()) {
      if (session.call.conversationId !== conversationId) continue
      session.memberIds = userIds
      session.call.ringingUserIds = session.call.ringingUserIds.filter((id) => userIds.includes(id))
      if (removedUserId) {
        for (const [socketId, participant] of session.sockets) {
          if (participant.userId === removedUserId) session.sockets.delete(socketId)
        }
        this.emit([removedUserId], 'dm:call:ended', { callId: session.call.id, conversationId, reason: 'disconnected' })
        void this.voice.removeDmParticipant(session.call.id, removedUserId).catch((error: unknown) =>
          this.logger.error('Failed to remove departed group member from voice', error))
      }
      if (session.sockets.size === 0 || (session.sockets.size < 2 && session.call.ringingUserIds.length === 0)) this.end(session, 'disconnected')
      else this.broadcast(session)
    }
  }

  setEmitter(emit: (userIds: string[], event: string, payload: unknown) => void) {
    this.emit = emit
  }

  async sync(userId: string): Promise<DmCall[]> {
    const memberships = await this.prisma.directConversationMember.findMany({
      where: { userId },
      select: { conversationId: true }
    })
    const allowed = new Set(memberships.map((member) => member.conversationId))
    return [...this.sessions.values()].filter((s) => allowed.has(s.call.conversationId)).map((s) => this.snapshot(s))
  }

  async start(
    conversationId: string,
    user: { id: string; username: string; displayName: string | null },
    socketId: string
  ): Promise<DmCall> {
    if (!this.voice.isConfigured) throw new ServiceUnavailableException('Voice is not configured')
    await this.dm.requireMembership(conversationId, user.id)
    const members = await this.prisma.directConversationMember.findMany({
      where: { conversationId },
      select: { userId: true, muted: true, user: { select: { isBot: true } } }
    })
    const memberIds = members.filter((member) => !member.user.isBot).map((member) => member.userId)
    if (!memberIds.includes(user.id) || memberIds.length < 2)
      throw new BadRequestException('At least two people are needed for a call')
    if ([...this.sessions.values()].some((s) => s.call.conversationId === conversationId)) {
      throw new BadRequestException('A call is already active in this conversation')
    }
    this.requireNotBusy(user.id)
    const id = randomUUID()
    const expiresAt = Date.now() + 30_000
    const call: DmCall = {
      id,
      conversationId,
      callerId: user.id,
      callerName: user.displayName ?? user.username,
      createdAt: new Date().toISOString(),
      ringingUntil: new Date(expiresAt).toISOString(),
      ringingUserIds: members.filter((member) => !member.user.isBot && !member.muted && member.userId !== user.id).map((member) => member.userId),
      participants: []
    }
    const session: CallSession = {
      call,
      memberIds,
      sockets: new Map([[socketId, { userId: user.id, username: call.callerName }]]),
      timer: setTimeout(() => {
        if (session.sockets.size < 2) this.end(session, 'timeout')
        else {
          session.call.ringingUserIds = []
          session.call.ringingUntil = null
          this.broadcast(session)
        }
      }, 30_000)
    }
    this.sessions.set(id, session)
    this.broadcast(session)
    void this.notifications
      .dispatch({
        userIds: call.ringingUserIds,
        kind: InAppNotificationKind.dm_call,
        dedupeKey: `dm-call:${id}`,
        payload: { conversationId, callId: id, authorName: call.callerName },
        title: 'Incoming voice call',
        body: `${call.callerName} is calling. Open Jablu to join.`,
        url: getDmCallUrl(conversationId, id),
        push: true,
        expiresAt
      })
      .catch((error: unknown) => this.logger.error('Failed to notify DM call recipients', error))
    return this.snapshot(session)
  }

  async accept(
    callId: string,
    user: { id: string; username: string; displayName: string | null },
    socketId: string
  ): Promise<DmCall> {
    const session = await this.requireMember(callId, user.id)
    this.requireNotBusy(user.id, callId)
    if ([...session.sockets].some(([id, p]) => p.userId === user.id && id !== socketId)) {
      throw new BadRequestException('You already joined this call on another device')
    }
    session.sockets.set(socketId, { userId: user.id, username: user.displayName ?? user.username })
    session.call.ringingUserIds = session.call.ringingUserIds.filter((id) => id !== user.id)
    this.broadcast(session)
    return this.snapshot(session)
  }

  async decline(callId: string, userId: string) {
    const session = await this.requireMember(callId, userId)
    session.call.ringingUserIds = session.call.ringingUserIds.filter((id) => id !== userId)
    if (session.sockets.size < 2 && session.call.ringingUserIds.length === 0) this.end(session, 'declined')
    else this.broadcast(session)
  }

  async leave(callId: string, userId: string, socketId: string) {
    const session = await this.requireMember(callId, userId)
    if (session.sockets.get(socketId)?.userId !== userId)
      throw new ForbiddenException('This device has not joined the call')
    this.removeSocket(session, socketId, 'hangup')
  }

  leaveSocket(socketId: string) {
    for (const session of this.sessions.values()) {
      if (session.sockets.has(socketId)) this.removeSocket(session, socketId, 'disconnected')
    }
  }

  async token(callId: string, user: { id: string; username: string }) {
    const session = await this.requireMember(callId, user.id)
    if (![...session.sockets.values()].some((p) => p.userId === user.id)) {
      throw new ForbiddenException('Accept the call before requesting a voice token')
    }
    const token = await this.voice.generateDmToken(user.id, user.username, callId)
    if (this.sessions.get(callId) !== session) throw new BadRequestException('This call has ended')
    return token
  }

  async state(
    callId: string,
    userId: string,
    socketId: string,
    state: { muted?: boolean; deafened?: boolean; camera?: boolean; screenShare?: boolean }
  ) {
    const session = await this.requireMember(callId, userId)
    const participant = session.sockets.get(socketId)
    if (participant?.userId !== userId) throw new ForbiddenException('This device has not joined the call')
    for (const key of ['muted', 'deafened', 'camera', 'screenShare'] as const) {
      if (typeof state[key] === 'boolean') participant[key] = state[key]
    }
    this.broadcast(session)
  }

  private async requireMember(callId: string, userId: string): Promise<CallSession> {
    const session = this.sessions.get(callId)
    if (!session) throw new BadRequestException('This call has ended')
    await this.dm.requireMembership(session.call.conversationId, userId)
    // Membership checks yield; a hangup or timeout may have ended this call meanwhile.
    if (this.sessions.get(callId) !== session) throw new BadRequestException('This call has ended')
    return session
  }

  private requireNotBusy(userId: string, exceptId?: string) {
    if (
      [...this.sessions.values()].some(
        (s) => s.call.id !== exceptId && [...s.sockets.values()].some((p) => p.userId === userId)
      )
    ) {
      throw new BadRequestException('Leave your current call first')
    }
  }

  private snapshot(session: CallSession): DmCall {
    return {
      ...session.call,
      ringingUserIds: [...session.call.ringingUserIds],
      participants: [...session.sockets.values()].map((p) => ({ ...p }))
    }
  }

  private broadcast(session: CallSession) {
    this.emit(session.memberIds, 'dm:call:update', this.snapshot(session))
  }

  private removeSocket(session: CallSession, socketId: string, reason: DmCallEndReason) {
    session.sockets.delete(socketId)
    if (
      session.sockets.size === 0 ||
      (session.sockets.size < 2 && session.call.ringingUserIds.length === 0) ||
      (![...session.sockets.values()].some((p) => p.userId === session.call.callerId) && session.sockets.size < 2)
    ) {
      this.end(session, reason)
    } else this.broadcast(session)
  }

  private end(session: CallSession, reason: DmCallEndReason) {
    clearTimeout(session.timer)
    this.sessions.delete(session.call.id)
    this.emit(session.memberIds, 'dm:call:ended', {
      callId: session.call.id,
      conversationId: session.call.conversationId,
      reason
    })
    void this.voice
      .deleteDmRoom(session.call.id)
      .catch((error: unknown) => this.logger.warn('Failed to close DM voice room', error))
  }

  onModuleDestroy() {
    this.events.off('dm:members-changed', this.onMembersChanged)
    for (const session of this.sessions.values()) this.end(session, 'disconnected')
  }
}
