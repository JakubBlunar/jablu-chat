import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { ServerRole } from '@prisma/client'
import { CronJob } from 'cron'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { RedisService } from '../redis/redis.service'
import type { CreateEventInput, UpdateEventInput } from '@chat/shared'

const REMINDER_KEY = 'event:reminders'
const POLL_INTERVAL_MS = 5 * 60 * 1000

@Injectable()
export class ServerEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServerEventsService.name)
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private reminderClient: import('ioredis').default | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly push: PushService,
    private readonly eventBus: EventBusService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  onModuleInit() {
    this.reminderClient = this.redis.client.duplicate()
    this.reminderClient.on('error', (err) => this.logger.warn('Event reminder Redis error', err.message))
    this.startReminderPoll()
    this.registerCleanupCron()
  }

  async onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.reminderClient) await this.reminderClient.quit().catch(() => {})
  }

  async create(serverId: string, userId: string, input: CreateEventInput) {
    await this.assertMember(serverId, userId)

    if (input.locationType === 'voice_channel') {
      if (!input.channelId) throw new BadRequestException('channelId is required for voice_channel events')
      const ch = await this.prisma.channel.findFirst({
        where: { id: input.channelId, serverId, type: 'voice' }
      })
      if (!ch) throw new BadRequestException('Voice channel not found in this server')
    }

    const event = await this.prisma.serverEvent.create({
      data: {
        serverId,
        creatorId: userId,
        name: input.name,
        description: input.description ?? null,
        locationType: input.locationType,
        channelId: input.channelId ?? null,
        locationText: input.locationText ?? null,
        startAt: new Date(input.startAt),
        endAt: input.endAt ? new Date(input.endAt) : null,
        recurrenceRule: input.recurrenceRule ?? null
      },
      include: this.eventInclude(userId)
    })

    await this.prisma.eventInterest.create({
      data: { eventId: event.id, userId }
    })

    await this.scheduleReminder(event.id, new Date(input.startAt))

    const withInterest = await this.prisma.serverEvent.findUnique({
      where: { id: event.id },
      include: this.eventInclude(userId)
    })

    const formatted = this.formatEvent(withInterest!, userId)
    this.eventBus.emit('event:created', { serverId, event: formatted })
    return formatted
  }

  async list(serverId: string, userId: string, limit = 10, cursor?: string, afterId?: string) {
    await this.assertMember(serverId, userId)

    const take = Math.min(limit, 50)

    const where: any = {
      serverId,
      status: { in: ['scheduled', 'active'] }
    }

    if (cursor && afterId) {
      where.OR = [
        { startAt: { gt: new Date(cursor) } },
        { startAt: new Date(cursor), id: { gt: afterId } }
      ]
    }

    const events = await this.prisma.serverEvent.findMany({
      where,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      include: this.eventInclude(userId)
    })

    const hasMore = events.length > take
    const page = hasMore ? events.slice(0, take) : events
    const lastItem = page[page.length - 1]

    return {
      events: page.map((e) => this.formatEvent(e, userId)),
      hasMore,
      nextCursor: lastItem ? lastItem.startAt.toISOString() : null,
      nextAfterId: lastItem ? lastItem.id : null
    }
  }

  async getOne(eventId: string, userId: string) {
    const event = await this.prisma.serverEvent.findUnique({
      where: { id: eventId },
      include: this.eventInclude(userId)
    })
    if (!event) throw new NotFoundException('Event not found')
    await this.assertMember(event.serverId, userId)
    return this.formatEvent(event, userId)
  }

  async update(eventId: string, userId: string, input: UpdateEventInput) {
    const event = await this.prisma.serverEvent.findUnique({
      where: { id: eventId },
      include: { server: { select: { ownerId: true } } }
    })
    if (!event) throw new NotFoundException('Event not found')
    await this.assertCanManage(event.serverId, userId, event.creatorId, event.server.ownerId)

    if (input.locationType === 'voice_channel' || (!input.locationType && event.locationType === 'voice_channel')) {
      const chId = input.channelId ?? event.channelId
      if (!chId) throw new BadRequestException('channelId is required for voice_channel events')
      const ch = await this.prisma.channel.findFirst({
        where: { id: chId, serverId: event.serverId, type: 'voice' }
      })
      if (!ch) throw new BadRequestException('Voice channel not found in this server')
    }

    const updated = await this.prisma.serverEvent.update({
      where: { id: eventId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.locationType !== undefined && { locationType: input.locationType }),
        ...(input.channelId !== undefined && { channelId: input.channelId }),
        ...(input.locationText !== undefined && { locationText: input.locationText }),
        ...(input.startAt !== undefined && { startAt: new Date(input.startAt) }),
        ...(input.endAt !== undefined && { endAt: input.endAt ? new Date(input.endAt) : null }),
        ...(input.recurrenceRule !== undefined && { recurrenceRule: input.recurrenceRule })
      },
      include: this.eventInclude(userId)
    })

    if (input.startAt) {
      await this.removeReminder(eventId)
      await this.scheduleReminder(eventId, new Date(input.startAt))
    }

    const formatted = this.formatEvent(updated, userId)
    this.eventBus.emit('event:updated', { serverId: updated.serverId, event: formatted })
    return formatted
  }

  async cancel(eventId: string, userId: string) {
    const event = await this.prisma.serverEvent.findUnique({
      where: { id: eventId },
      include: { server: { select: { ownerId: true } } }
    })
    if (!event) throw new NotFoundException('Event not found')
    await this.assertCanManage(event.serverId, userId, event.creatorId, event.server.ownerId)

    const updated = await this.prisma.serverEvent.update({
      where: { id: eventId },
      data: { status: 'cancelled' },
      include: this.eventInclude(userId)
    })

    await this.removeReminder(eventId)

    const formatted = this.formatEvent(updated, userId)
    this.eventBus.emit('event:cancelled', { serverId: updated.serverId, event: formatted })
    return formatted
  }

  async toggleInterest(eventId: string, userId: string): Promise<{ interested: boolean; count: number }> {
    const event = await this.prisma.serverEvent.findUnique({ where: { id: eventId } })
    if (!event) throw new NotFoundException('Event not found')
    await this.assertMember(event.serverId, userId)

    const existing = await this.prisma.eventInterest.findUnique({
      where: { eventId_userId: { eventId, userId } }
    })

    if (existing) {
      await this.prisma.eventInterest.delete({
        where: { eventId_userId: { eventId, userId } }
      })
    } else {
      await this.prisma.eventInterest.create({
        data: { eventId, userId }
      })
    }

    const count = await this.prisma.eventInterest.count({ where: { eventId } })
    this.eventBus.emit('event:interest', {
      serverId: event.serverId,
      eventId,
      userId,
      interested: !existing,
      count
    })
    return { interested: !existing, count }
  }

  async getInterestedUsers(eventId: string, userId: string) {
    const event = await this.prisma.serverEvent.findUnique({ where: { id: eventId } })
    if (!event) throw new NotFoundException('Event not found')
    await this.assertMember(event.serverId, userId)

    return this.prisma.eventInterest.findMany({
      where: { eventId },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true }
        }
      }
    })
  }

  async startEvent(eventId: string) {
    const event = await this.prisma.serverEvent.findUnique({ where: { id: eventId } })
    if (!event || event.status !== 'scheduled') return null

    const updated = await this.prisma.serverEvent.update({
      where: { id: eventId },
      data: { status: 'active' },
      include: this.eventInclude(event.creatorId)
    })

    this.eventBus.emit('event:started', {
      serverId: event.serverId,
      event: this.formatEvent(updated, event.creatorId)
    })

    const interestedUsers = await this.prisma.eventInterest.findMany({
      where: { eventId },
      select: { userId: true }
    })
    if (interestedUsers.length > 0) {
      await this.push.sendToUsers(
        interestedUsers.map((u) => u.userId),
        {
          title: `Event starting: ${event.name}`,
          body: event.description?.slice(0, 100) ?? 'An event is starting now!',
          url: `/channels/${event.serverId}`
        }
      )
    }

    return updated
  }

  async completeEvent(eventId: string) {
    const event = await this.prisma.serverEvent.findUnique({ where: { id: eventId } })
    if (!event || (event.status !== 'active' && event.status !== 'scheduled')) return null

    await this.prisma.serverEvent.update({
      where: { id: eventId },
      data: { status: 'completed' }
    })

    this.eventBus.emit('event:cancelled', { serverId: event.serverId, event: { id: eventId, status: 'completed' } })

    if (event.recurrenceRule) {
      await this.spawnNextOccurrence(event)
    }

    return true
  }

  private async spawnNextOccurrence(event: {
    id: string
    serverId: string
    creatorId: string
    name: string
    description: string | null
    locationType: any
    channelId: string | null
    locationText: string | null
    startAt: Date
    endAt: Date | null
    recurrenceRule: string | null
  }) {
    if (!event.recurrenceRule) return

    const nextStart = this.getNextDate(event.startAt, event.recurrenceRule)
    const duration = event.endAt ? event.endAt.getTime() - event.startAt.getTime() : null
    const nextEnd = duration ? new Date(nextStart.getTime() + duration) : null

    const newEvent = await this.prisma.serverEvent.create({
      data: {
        serverId: event.serverId,
        creatorId: event.creatorId,
        name: event.name,
        description: event.description,
        locationType: event.locationType,
        channelId: event.channelId,
        locationText: event.locationText,
        startAt: nextStart,
        endAt: nextEnd,
        recurrenceRule: event.recurrenceRule as any,
        status: 'scheduled'
      }
    })

    const previousInterests = await this.prisma.eventInterest.findMany({
      where: { eventId: event.id },
      select: { userId: true }
    })
    if (previousInterests.length > 0) {
      await this.prisma.eventInterest.createMany({
        data: previousInterests.map((i) => ({ eventId: newEvent.id, userId: i.userId }))
      })
    }

    await this.scheduleReminder(newEvent.id, nextStart)

    const full = await this.prisma.serverEvent.findUnique({
      where: { id: newEvent.id },
      include: this.eventInclude(event.creatorId)
    })
    if (full) {
      this.eventBus.emit('event:created', {
        serverId: event.serverId,
        event: this.formatEvent(full, event.creatorId)
      })
    }

    return newEvent
  }

  private getNextDate(current: Date, rule: string): Date {
    const next = new Date(current)
    switch (rule) {
      case 'daily':
        next.setDate(next.getDate() + 1)
        break
      case 'weekly':
        next.setDate(next.getDate() + 7)
        break
      case 'biweekly':
        next.setDate(next.getDate() + 14)
        break
      case 'monthly':
        next.setMonth(next.getMonth() + 1)
        break
    }
    return next
  }

  private async scheduleReminder(eventId: string, startAt: Date) {
    const reminderTime = startAt.getTime() - 30 * 60 * 1000
    if (reminderTime <= Date.now()) return
    if (!this.reminderClient || this.reminderClient.status !== 'ready') return

    try {
      await this.reminderClient.zadd(REMINDER_KEY, reminderTime, `reminder:${eventId}`)
      await this.reminderClient.zadd(REMINDER_KEY, startAt.getTime(), `start:${eventId}`)
    } catch (err) {
      this.logger.warn('Failed to schedule event reminder in Redis', err)
    }
  }

  private async removeReminder(eventId: string) {
    if (!this.reminderClient || this.reminderClient.status !== 'ready') return
    try {
      await this.reminderClient.zrem(REMINDER_KEY, `reminder:${eventId}`, `start:${eventId}`)
    } catch {
      // non-critical
    }
  }

  private startReminderPoll() {
    this.pollTimer = setInterval(() => {
      void this.processReminders()
      void this.completeEndedEvents()
    }, POLL_INTERVAL_MS)
    setTimeout(() => {
      void this.processReminders()
      void this.completeEndedEvents()
    }, 5000)
  }

  private async processReminders() {
    try {
      if (!this.reminderClient || this.reminderClient.status !== 'ready') return
      const now = Date.now()
      const due = await this.reminderClient.zrangebyscore(REMINDER_KEY, 0, now)
      if (due.length === 0) return

      for (const entry of due) {
        const [type, eventId] = entry.split(':') as [string, string]
        if (type === 'reminder') {
          await this.sendReminderNotification(eventId)
        } else if (type === 'start') {
          const started = await this.startEvent(eventId)
          if (started) {
            this.logger.log(`Auto-started event ${eventId}`)
          }
        }
      }

      await this.reminderClient.zremrangebyscore(REMINDER_KEY, 0, now)
    } catch (err) {
      this.logger.warn('Reminder poll error', err)
    }
  }

  private async sendReminderNotification(eventId: string) {
    const event = await this.prisma.serverEvent.findUnique({
      where: { id: eventId },
      select: { name: true, serverId: true, status: true }
    })
    if (!event || event.status !== 'scheduled') return

    const interestedUsers = await this.prisma.eventInterest.findMany({
      where: { eventId },
      select: { userId: true }
    })
    if (interestedUsers.length === 0) return

    await this.push.sendToUsers(
      interestedUsers.map((u) => u.userId),
      {
        title: `Starting soon: ${event.name}`,
        body: 'This event starts in 30 minutes!',
        url: `/channels/${event.serverId}`
      }
    )
  }

  private registerCleanupCron() {
    const job = new CronJob('0 4 * * *', () => void this.cleanupOldEvents())
    this.schedulerRegistry.addCronJob('event-cleanup', job)
    job.start()
    this.logger.log('Event cleanup cron registered (daily at 4:00)')
  }

  private async cleanupOldEvents() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    try {
      const result = await this.prisma.serverEvent.deleteMany({
        where: {
          status: { in: ['completed', 'cancelled'] },
          updatedAt: { lt: cutoff }
        }
      })
      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} old events`)
      }
    } catch (err) {
      this.logger.error('Event cleanup failed', err)
    }
  }

  private async completeEndedEvents() {
    const now = new Date()
    const ended = await this.prisma.serverEvent.findMany({
      where: {
        status: 'active',
        endAt: { lte: now }
      }
    })
    for (const event of ended) {
      await this.completeEvent(event.id)
    }
  }

  private eventInclude(userId: string) {
    return {
      creator: {
        select: { id: true, username: true, displayName: true, avatarUrl: true }
      },
      channel: {
        select: { id: true, name: true }
      },
      _count: {
        select: { interests: true }
      },
      interests: {
        where: { userId },
        select: { userId: true }
      }
    } as const
  }

  private formatEvent(event: any, userId: string) {
    return {
      id: event.id,
      serverId: event.serverId,
      creatorId: event.creatorId,
      name: event.name,
      description: event.description,
      locationType: event.locationType,
      channelId: event.channelId,
      channelName: event.channel?.name ?? null,
      locationText: event.locationText,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt?.toISOString() ?? null,
      status: event.status,
      recurrenceRule: event.recurrenceRule,
      interestedCount: event._count?.interests ?? 0,
      isInterested: event.interests?.some((i: any) => i.userId === userId) ?? false,
      createdAt: event.createdAt.toISOString(),
      creator: event.creator ?? undefined
    }
  }

  private async assertMember(serverId: string, userId: string) {
    const membership = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } }
    })
    if (!membership) throw new ForbiddenException('Not a member of this server')
  }

  private async assertCanManage(serverId: string, userId: string, creatorId: string, ownerId: string) {
    if (userId === creatorId || userId === ownerId) return

    const membership = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } }
    })
    if (!membership) throw new ForbiddenException('Not a member of this server')
    if (membership.role !== ServerRole.admin && membership.role !== ServerRole.owner) {
      throw new ForbiddenException('Only event creator, server owner, or admins can manage events')
    }
  }
}
