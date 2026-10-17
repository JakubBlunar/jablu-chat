import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { InAppNotificationKind, Prisma } from '../prisma-client'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import {
  IN_APP_NOTIFICATION_CAP_DEFAULT,
  IN_APP_NOTIFICATION_USERS_EVENT,
  NOTIFICATION_CLEAR_EVENT,
  InAppNotificationsService
} from './in-app-notifications.service'

describe('InAppNotificationsService', () => {
  let service: InAppNotificationsService
  let prisma: {
    channel: { findUnique: jest.Mock }
    channelNotifPref: { findMany: jest.Mock }
    serverMember: { findMany: jest.Mock }
    inAppNotification: {
      upsert: jest.Mock
      findUnique: jest.Mock
      findMany: jest.Mock
      count: jest.Mock
      deleteMany: jest.Mock
      findFirst: jest.Mock
      update: jest.Mock
      updateMany: jest.Mock
    }
    $transaction: jest.Mock
    $executeRaw: jest.Mock
  }
  let events: { emit: jest.Mock }

  beforeEach(async () => {
    process.env.IN_APP_NOTIFICATION_CAP = String(IN_APP_NOTIFICATION_CAP_DEFAULT)
    process.env.IN_APP_NOTIFICATION_TTL_DAYS = '0'

    prisma = {
      channel: { findUnique: jest.fn().mockResolvedValue({ serverId: 's1' }) },
      channelNotifPref: { findMany: jest.fn().mockResolvedValue([]) },
      serverMember: { findMany: jest.fn().mockResolvedValue([]) },
      inAppNotification: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      },
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1)
    }
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma))
    events = { emit: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InAppNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: events }
      ]
    }).compile()

    service = module.get(InAppNotificationsService)
  })

  function executedQuery(index = 0) {
    const [strings, ...values] = prisma.$executeRaw.mock.calls[index]
    return Prisma.sql(strings, ...values)
  }

  it('skips muted users for mentions', async () => {
    prisma.channelNotifPref.findMany.mockResolvedValue([{ userId: 'u1', level: 'none' }])

    await service.recordMentions(['u1'], {
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      messageId: 'm1',
      authorName: 'alice',
      snippet: 'hi'
    })

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(events.emit).not.toHaveBeenCalled()
  })

  it('creates mention and emits for unmuted user', async () => {
    prisma.serverMember.findMany.mockResolvedValue([{ userId: 'u1', notifLevel: 'mentions' }])

    await service.recordMentions(['u1'], {
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      messageId: 'm1',
      authorName: 'alice',
      snippet: 'hi'
    })

    expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: ['u1'] })
    expect(executedQuery().text).toContain('read_at = notification.read_at')
  })

  it('preserves thread context in mention notification payloads', async () => {
    await service.recordMentions(['u1'], {
      serverId: 's1', channelId: 'c1', channelName: 'general',
      messageId: 'reply', threadParentId: 'parent', authorName: 'alice', snippet: 'hi'
    })
    expect(executedQuery().values).toContainEqual(expect.stringContaining('"threadParentId":"parent"'))
  })

  it('resolves preferences once for 5,000 recipients and uses two statements per batch', async () => {
    const recipients = Array.from({ length: 5000 }, (_, i) => `u${i}`)
    await service.recordChannelMessage(recipients, {
      serverId: 's1', channelId: 'c1', channelName: 'general',
      messageId: 'm1', authorName: 'alice', snippet: 'hi'
    })

    expect(prisma.channel.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.channelNotifPref.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.serverMember.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.$transaction).toHaveBeenCalledTimes(50)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(100)
    expect(events.emit).toHaveBeenCalledTimes(50)
    expect(executedQuery().text).toContain("notification.payload->>'count'")
    expect(executedQuery().text).toContain('notification.read_at IS NOT NULL')
  })

  it('preserves channel-over-server preference precedence and the default all level', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'muted', notifLevel: 'none' },
      { userId: 'override', notifLevel: 'none' },
      { userId: 'mentions', notifLevel: 'mentions' }
    ])
    prisma.channelNotifPref.findMany.mockResolvedValue([{ userId: 'override', level: 'all' }])
    await service.recordChannelMessage(['muted', 'override', 'mentions', 'default'], {
      serverId: 's1', channelId: 'c1', channelName: 'general',
      messageId: 'm1', authorName: 'alice', snippet: 'hi'
    })
    expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, {
      userIds: ['override', 'default']
    })
  })

  it('skips a channel removed before preference resolution', async () => {
    prisma.channel.findUnique.mockResolvedValue(null)
    await service.recordMentions(['u1'], {
      serverId: 's1', channelId: 'c1', channelName: 'general',
      messageId: 'm1', authorName: 'alice', snippet: 'hi'
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('notifies only committed batches when a later batch fails', async () => {
    prisma.$transaction
      .mockImplementationOnce(async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma))
      .mockRejectedValueOnce(new Error('database unavailable'))
    const recipients = Array.from({ length: 150 }, (_, i) => `u${i}`)
    await expect(service.record(recipients, {
      kind: InAppNotificationKind.announcement, payload: {}
    })).rejects.toThrow('database unavailable')
    expect(events.emit).toHaveBeenCalledTimes(1)
    expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, {
      userIds: recipients.slice(0, 100)
    })
  })

  it('markRead throws when not found', async () => {
    prisma.inAppNotification.findFirst.mockResolvedValue(null)
    await expect(service.markRead('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('markRead returns wire shape', async () => {
    const now = new Date()
    prisma.inAppNotification.findFirst.mockResolvedValue({
      id: 'n1',
      kind: InAppNotificationKind.mention,
      payload: {},
      readAt: null,
      createdAt: now,
      updatedAt: now
    })
    prisma.inAppNotification.update.mockResolvedValue({
      id: 'n1',
      kind: InAppNotificationKind.mention,
      payload: {},
      readAt: now,
      createdAt: now,
      updatedAt: now
    })

    const out = await service.markRead('u1', 'n1')
    expect(out.id).toBe('n1')
    expect(out.readAt).toBe(now.toISOString())
    // Without this the badge on the user's other devices stays stale.
    expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: ['u1'] })
  })

  it('markAllRead bumps other devices and clears every toast', async () => {
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 3 })

    await service.markAllRead('u1')

    expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: ['u1'] })
    expect(events.emit).toHaveBeenCalledWith(NOTIFICATION_CLEAR_EVENT, {
      userId: 'u1',
      urls: null
    })
  })

  it('markAllRead does not bump when nothing was unread', async () => {
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 0 })

    await service.markAllRead('u1')

    expect(events.emit).not.toHaveBeenCalledWith(
      IN_APP_NOTIFICATION_USERS_EVENT,
      expect.anything()
    )
  })

  describe('clearing on read', () => {
    it('markChannelRead clears the toast for that channel on other devices', async () => {
      prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 })
      prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })

      await service.markChannelRead('u1', 'c1')

      expect(events.emit).toHaveBeenCalledWith(NOTIFICATION_CLEAR_EVENT, {
        userId: 'u1',
        urls: ['/channels/s1/c1']
      })
    })

    it('markChannelRead also clears reply rows, not just mentions and threads', async () => {
      prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 })
      prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })

      await service.markChannelRead('u1', 'c1')

      const where = prisma.inAppNotification.updateMany.mock.calls[0][0].where
      const kinds = where.OR.map((clause: { kind?: string }) => clause.kind).filter(Boolean)
      expect(kinds).toEqual(
        expect.arrayContaining([
          InAppNotificationKind.mention,
          InAppNotificationKind.thread_reply,
          InAppNotificationKind.reply
        ])
      )
    })

    it('markDmRead clears the toast for that conversation', async () => {
      prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 })

      await service.markDmRead('u1', 'conv-1')

      expect(events.emit).toHaveBeenCalledWith(NOTIFICATION_CLEAR_EVENT, {
        userId: 'u1',
        urls: ['/channels/@me/conv-1']
      })
    })
  })

  describe('record', () => {
    it('upserts when given a dedupeKey so a retry updates rather than duplicates', async () => {
      await service.record(['u1'], {
        kind: InAppNotificationKind.moderation,
        dedupeKey: 'moderation:s1:ban',
        payload: { serverName: 'Jablu' }
      })

      expect(executedQuery().text).toContain('ON CONFLICT (user_id, dedupe_key) DO UPDATE')
      expect(executedQuery().values).toContain('moderation:s1:ban')
    })

    it('creates a stacking row when no dedupeKey is given', async () => {
      await service.record(['u1'], {
        kind: InAppNotificationKind.announcement,
        payload: { title: 'Maintenance' }
      })

      expect(executedQuery().values).toContain(null)
    })

    it('splits an instance-wide broadcast across several transactions', async () => {
      const targets = Array.from({ length: 250 }, (_, i) => `u${i}`)

      await service.record(targets, {
        kind: InAppNotificationKind.announcement,
        payload: { title: 'Maintenance' }
      })

      // 250 recipients at a batch size of 100.
      expect(prisma.$transaction).toHaveBeenCalledTimes(3)
      expect(events.emit).toHaveBeenCalledTimes(3)
      expect(events.emit.mock.calls.map(([, payload]) => payload.userIds).flat()).toEqual(targets)
    })

    it('deduplicates recipients and skips empty lists', async () => {

      await service.record(['u1', 'u1'], {
        kind: InAppNotificationKind.level_up,
        payload: {}
      })
      expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: ['u1'] })

      events.emit.mockClear()
      await service.record([], { kind: InAppNotificationKind.level_up, payload: {} })
      expect(events.emit).not.toHaveBeenCalled()
    })
  })
})
