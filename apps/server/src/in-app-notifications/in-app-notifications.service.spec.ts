import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { InAppNotificationKind } from '../prisma-client'
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
    channelNotifPref: { findUnique: jest.Mock }
    serverMember: { findUnique: jest.Mock }
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
  }
  let events: { emit: jest.Mock }

  beforeEach(async () => {
    process.env.IN_APP_NOTIFICATION_CAP = String(IN_APP_NOTIFICATION_CAP_DEFAULT)
    process.env.IN_APP_NOTIFICATION_TTL_DAYS = '0'

    prisma = {
      channel: { findUnique: jest.fn() },
      channelNotifPref: { findUnique: jest.fn() },
      serverMember: { findUnique: jest.fn() },
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
      $transaction: jest.fn()
    }
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

  it('skips muted users for mentions', async () => {
    prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })
    prisma.channelNotifPref.findUnique.mockResolvedValue({ level: 'none' })
    prisma.serverMember.findUnique.mockResolvedValue(null)
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      await fn({
        inAppNotification: {
          upsert: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
          deleteMany: jest.fn()
        }
      })
    })

    await service.recordMentions(['u1'], {
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      messageId: 'm1',
      authorName: 'alice',
      snippet: 'hi'
    })

    expect(prisma.inAppNotification.upsert).not.toHaveBeenCalled()
    expect(events.emit).not.toHaveBeenCalled()
  })

  it('creates mention and emits for unmuted user', async () => {
    prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })
    prisma.channelNotifPref.findUnique.mockResolvedValue(null)
    prisma.serverMember.findUnique.mockResolvedValue({ notifLevel: 'mentions' })
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        inAppNotification: {
          upsert: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn().mockResolvedValue(1),
          deleteMany: jest.fn()
        }
      }
      await fn(tx)
    })

    await service.recordMentions(['u1'], {
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      messageId: 'm1',
      authorName: 'alice',
      snippet: 'hi'
    })

    expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: ['u1'] })
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
    function stubTransaction() {
      const tx = {
        inAppNotification: {
          upsert: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn().mockResolvedValue(1),
          deleteMany: jest.fn()
        }
      }
      prisma.$transaction.mockImplementation(async (fn: (t: any) => Promise<void>) => {
        await fn(tx)
      })
      return tx
    }

    it('upserts when given a dedupeKey so a retry updates rather than duplicates', async () => {
      const tx = stubTransaction()

      await service.record(['u1'], {
        kind: InAppNotificationKind.moderation,
        dedupeKey: 'moderation:s1:ban',
        payload: { serverName: 'Jablu' }
      })

      expect(tx.inAppNotification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_dedupeKey: { userId: 'u1', dedupeKey: 'moderation:s1:ban' } }
        })
      )
      expect(tx.inAppNotification.create).not.toHaveBeenCalled()
    })

    it('creates a stacking row when no dedupeKey is given', async () => {
      const tx = stubTransaction()

      await service.record(['u1'], {
        kind: InAppNotificationKind.announcement,
        payload: { title: 'Maintenance' }
      })

      expect(tx.inAppNotification.create).toHaveBeenCalled()
      expect(tx.inAppNotification.upsert).not.toHaveBeenCalled()
    })

    it('splits an instance-wide broadcast across several transactions', async () => {
      stubTransaction()
      const targets = Array.from({ length: 250 }, (_, i) => `u${i}`)

      await service.record(targets, {
        kind: InAppNotificationKind.announcement,
        payload: { title: 'Maintenance' }
      })

      // 250 recipients at a batch size of 100.
      expect(prisma.$transaction).toHaveBeenCalledTimes(3)
      expect(events.emit).toHaveBeenCalledWith(IN_APP_NOTIFICATION_USERS_EVENT, {
        userIds: targets
      })
    })

    it('deduplicates recipients and skips empty lists', async () => {
      stubTransaction()

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
