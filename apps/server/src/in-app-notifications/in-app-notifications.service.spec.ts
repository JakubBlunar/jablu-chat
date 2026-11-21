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
    $queryRaw: jest.Mock
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
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([])
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

  it('defaults to 1,000 records and locks the account before writing and pruning', async () => {
    delete process.env.IN_APP_NOTIFICATION_CAP
    const defaults = await Test.createTestingModule({
      providers: [
        InAppNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: events }
      ]
    }).compile()
    await defaults.get(InAppNotificationsService).record(['u1'], { kind: InAppNotificationKind.announcement, payload: {} })
    expect(IN_APP_NOTIFICATION_CAP_DEFAULT).toBe(1000)
    expect(executedQuery(1).values).toContain(1000)
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.$executeRaw.mock.invocationCallOrder[0])
    await defaults.close()
  })

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
    expect(executedQuery().text).toContain('read_at = COALESCE(notification.read_at, EXCLUDED.read_at)')
  })

  it('preserves thread context in mention notification payloads', async () => {
    await service.recordMentions(['u1'], {
      serverId: 's1', channelId: 'c1', channelName: 'general',
      messageId: 'reply', threadParentId: 'parent', authorName: 'alice', snippet: 'hi'
    })
    expect(executedQuery().values).toContainEqual(expect.stringContaining('"threadParentId":"parent"'))
  })

  it('resolves preferences once for 5,000 recipients and locks recipients before enforcing the cap', async () => {
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
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(50)
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
    it('broadcasts dismissal only for alerts belonging to the server explicitly marked read', async () => {
      prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 })
      prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })

      await service.markServerChannelsRead('u1', ['c1', 'c2'])

      const clears = events.emit.mock.calls
        .filter(([event]) => event === NOTIFICATION_CLEAR_EVENT)
        .map(([, payload]) => payload as { userId: string; urls: string[] | null })
      expect(clears.every(({ userId, urls }) => userId === 'u1' && urls !== null)).toBe(true)
      expect(clears.flatMap(({ urls }) => urls ?? []).sort()).toEqual(['/channels/s1/c1', '/channels/s1/c2'])
    })

    it('markChannelRead clears the toast for that channel on other devices', async () => {
      prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 })
      prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })

      await service.markChannelRead('u1', 'c1')

      expect(events.emit).toHaveBeenCalledWith(NOTIFICATION_CLEAR_EVENT, {
        userId: 'u1',
        urls: ['/channels/s1/c1']
      })
    })

    it('markChannelRead clears message-related rows and leaves reactions unseen', async () => {
      prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 })
      prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })

      await service.markChannelRead('u1', 'c1')

      const where = prisma.inAppNotification.updateMany.mock.calls[0][0].where
      const kinds = where.OR.flatMap((clause: { kind?: { in?: string[] } }) => clause.kind?.in ?? [])
      expect(kinds).toEqual([
        InAppNotificationKind.mention,
        InAppNotificationKind.reply
      ])
    })

    it('markDmRead clears the toast for that conversation', async () => {
      prisma.inAppNotification.updateMany.mockResolvedValue({ count: 1 })

      await service.markDmRead('u1', 'conv-1')

      expect(prisma.inAppNotification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'u1', readAt: null, dedupeKey: 'dm:conv-1' }
      }))

      expect(events.emit).toHaveBeenCalledWith(NOTIFICATION_CLEAR_EVENT, {
        userId: 'u1',
        urls: ['/channels/@me/conv-1']
      })
    })
  })

  it('excludes reactions from the numeric unread count', async () => {
    await service.unreadCount('u1')
    expect(prisma.inAppNotification.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null, kind: { not: InAppNotificationKind.reaction } }
    })
  })

  it('returns unseen reaction locations and publishes account-wide changes when seen', async () => {
    const updatedAt = new Date('2026-11-20T10:00:00.000Z')
    prisma.inAppNotification.findMany.mockResolvedValue([
      { id: 'first', updatedAt, payload: { messageId: 'original', emoji: '🎉' } },
      { id: 'bad', updatedAt, payload: {} }
    ])
    const reactions = await service.unseenReactions('u1')
    expect(prisma.inAppNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', readAt: null, kind: InAppNotificationKind.reaction }
    }))
    expect(reactions).toEqual([
      { id: 'first', updatedAt: updatedAt.toISOString(), messageId: 'original', emoji: '🎉', isCustom: false }
    ])

    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'first' }])
    await expect(service.markReactionsSeen('u1', reactions)).resolves.toMatchObject({ ids: ['first'] })
    const [parts, , userId, values] = prisma.$queryRaw.mock.calls[0]
    expect(parts.join('')).toContain("kind = 'reaction' AND read_at IS NULL")
    expect(parts.join('')).toContain('(id, updated_at)')
    expect(userId).toBe('u1')
    expect(values.values).toEqual(['first', updatedAt])
    expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: ['u1'] })
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
  it('aggregates unread server notices independently of paginated notification rows', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ serverId: 's1', count: 2n }, { serverId: 's2', count: 1n }])
    expect(await service.unreadServerCounts('u1')).toEqual({ s1: 2, s2: 1 })
    const [strings, userId] = prisma.$queryRaw.mock.calls[0]
    expect(userId).toBe('u1')
    expect(strings.join('')).toContain('read_at IS NULL')
    expect(strings.join('')).toContain("'server_event'")
    expect(strings.join('')).not.toContain("'channel_message'")
  })

})
