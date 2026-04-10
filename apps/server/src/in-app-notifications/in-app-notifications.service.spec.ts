import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { InAppNotificationKind } from '@prisma/client'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import {
  IN_APP_NOTIFICATION_CAP_DEFAULT,
  IN_APP_NOTIFICATION_USERS_EVENT,
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
  })
})
