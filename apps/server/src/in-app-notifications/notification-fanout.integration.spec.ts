import { randomUUID } from 'node:crypto'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { Permission } from '@chat/shared'
import { EventBusService } from '../events/event-bus.service'
import { InAppNotificationKind } from '../prisma-client'
import { PrismaService } from '../prisma/prisma.service'
import { ReadStateService } from '../read-state/read-state.service'
import { RolesService } from '../roles/roles.service'
import { IN_APP_NOTIFICATION_USERS_EVENT, InAppNotificationsService } from './in-app-notifications.service'

const databaseUrl = process.env.NOTIFICATION_TEST_DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('Notification fan-out (PostgreSQL)', () => {
  let module: TestingModule
  let prisma: PrismaService
  let service: InAppNotificationsService
  let readState: ReadStateService
  let roles: RolesService
  const events = { emit: jest.fn() }
  const ids = Array.from({ length: 5000 }, () => randomUUID())
  const serverId = randomUUID()
  const channelId = randomUUID()
  const conversationId = randomUUID()
  const channelMessage = {
    serverId, channelId, channelName: 'general', messageId: 'm1', authorName: 'Alice', snippet: 'hello'
  }
  const dmMessage = { conversationId, messageId: 'm1', authorName: 'Alice', snippet: 'hello' }

  beforeAll(async () => {
    const oldCap = process.env.IN_APP_NOTIFICATION_CAP
    const oldTtl = process.env.IN_APP_NOTIFICATION_TTL_DAYS
    process.env.IN_APP_NOTIFICATION_CAP = '50'
    process.env.IN_APP_NOTIFICATION_TTL_DAYS = '1'
    try {
      module = await Test.createTestingModule({
        providers: [
          PrismaService, InAppNotificationsService, ReadStateService, RolesService,
          { provide: ConfigService, useValue: new ConfigService({ DATABASE_URL: databaseUrl }) },
          { provide: EventBusService, useValue: events }
        ]
      }).compile()
    } finally {
      if (oldCap === undefined) delete process.env.IN_APP_NOTIFICATION_CAP
      else process.env.IN_APP_NOTIFICATION_CAP = oldCap
      if (oldTtl === undefined) delete process.env.IN_APP_NOTIFICATION_TTL_DAYS
      else process.env.IN_APP_NOTIFICATION_TTL_DAYS = oldTtl
    }
    prisma = module.get(PrismaService)
    service = module.get(InAppNotificationsService)
    readState = module.get(ReadStateService)
    roles = module.get(RolesService)
    await prisma.onModuleInit()
    await prisma.user.createMany({
      data: ids.map((id) => ({
        id, username: `notification-test-${id}`, email: `${id}@example.invalid`, passwordHash: 'test-only'
      }))
    })
    await prisma.server.create({ data: { id: serverId, name: 'Notification test', ownerId: ids[0] } })
    await prisma.serverMember.createMany({ data: ids.map((userId) => ({ userId, serverId })) })
    await prisma.channel.create({ data: { id: channelId, serverId, name: 'general' } })
    await prisma.directConversation.create({ data: { id: conversationId } })
  }, 60_000)

  beforeEach(async () => {
    await prisma.inAppNotification.deleteMany({ where: { userId: { in: ids } } })
    await prisma.channelNotifPref.deleteMany({ where: { channelId } })
    await prisma.serverMember.updateMany({ where: { serverId }, data: { notifLevel: null } })
    await prisma.channelReadState.deleteMany({ where: { channelId } })
    await prisma.dmReadState.deleteMany({ where: { conversationId } })
    events.emit.mockClear()
  })

  afterAll(async () => {
    if (!prisma) return
    try {
      await prisma.server.deleteMany({ where: { id: serverId } })
      await prisma.directConversation.deleteMany({ where: { id: conversationId } })
      await prisma.user.deleteMany({ where: { id: { in: ids } } })
    } finally {
      await module.close()
    }
  })

  it('persists all 5,000 recipients and emits only committed batches of at most 100', async () => {
    await service.recordChannelMessage(ids, channelMessage)
    expect(await prisma.inAppNotification.count({ where: { userId: { in: ids } } })).toBe(5000)
    const batches = events.emit.mock.calls
      .filter(([event]) => event === IN_APP_NOTIFICATION_USERS_EVENT)
      .map(([, payload]) => payload.userIds as string[])
    expect(batches).toHaveLength(50)
    expect(batches.every((batch) => batch.length <= 100)).toBe(true)
    expect(batches.flat()).toEqual(ids)
  }, 30_000)

  it('increments coalesced counts atomically across concurrent messages', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) =>
      service.recordDmMessages([ids[0]], { ...dmMessage, messageId: `m${i}` })
    ))
    const rows = await prisma.inAppNotification.findMany({ where: { userId: ids[0] } })
    expect(rows).toHaveLength(1)
    expect(rows[0].payload).toEqual(expect.objectContaining({ count: 25 }))
  })

  it('restarts channel and DM counts after reading without creating duplicate rows', async () => {
    await service.recordChannelMessage([ids[0]], channelMessage)
    await service.recordChannelMessage([ids[0]], channelMessage)
    await service.recordDmMessages([ids[0]], dmMessage)
    await service.recordDmMessages([ids[0]], dmMessage)
    for (const row of await prisma.inAppNotification.findMany({ where: { userId: ids[0] } })) {
      expect(row.payload).toEqual(expect.objectContaining({ count: 2 }))
    }
    await service.markChannelRead(ids[0], channelId)
    await service.markDmRead(ids[0], conversationId)
    await service.recordChannelMessage([ids[0]], channelMessage)
    await service.recordDmMessages([ids[0]], dmMessage)
    const rows = await prisma.inAppNotification.findMany({ where: { userId: ids[0] } })
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.payload).toEqual(expect.objectContaining({ count: 1 }))
      expect(row.readAt).toBeNull()
    }
  })

  it('keeps mention retries read and preserves existing thread coalescing semantics', async () => {
    await service.recordMentions([ids[0], ids[0]], channelMessage)
    const mention = await prisma.inAppNotification.findFirstOrThrow({ where: { userId: ids[0] } })
    await service.markRead(ids[0], mention.id)
    await service.recordMentions([ids[0]], channelMessage)
    expect(await prisma.inAppNotification.count({ where: { userId: ids[0] } })).toBe(1)
    expect((await prisma.inAppNotification.findUniqueOrThrow({ where: { id: mention.id } })).readAt)
      .not.toBeNull()

    const thread = { ...channelMessage, threadParentId: 'parent' }
    await service.recordThreadActivity([ids[1]], thread)
    await service.markChannelRead(ids[1], channelId)
    await service.recordThreadActivity([ids[1]], thread)
    expect((await prisma.inAppNotification.findFirstOrThrow({ where: { userId: ids[1] } })).payload)
      .toEqual(expect.objectContaining({ count: 2 }))
  })

  it('stacks unkeyed notifications and reopens keyed one-shot notifications', async () => {
    const input = { kind: InAppNotificationKind.announcement, payload: { title: 'Maintenance' } }
    await service.record([ids[0]], input)
    await service.record([ids[0]], input)
    expect(await prisma.inAppNotification.count({ where: { userId: ids[0] } })).toBe(2)
    const keyed = { ...input, dedupeKey: 'maintenance' }
    await service.record([ids[0]], keyed)
    await service.markAllRead(ids[0])
    await service.record([ids[0]], keyed)
    expect(await prisma.inAppNotification.count({ where: { userId: ids[0] } })).toBe(3)
    const row = await prisma.inAppNotification.findUniqueOrThrow({
      where: { userId_dedupeKey: { userId: ids[0], dedupeKey: 'maintenance' } }
    })
    expect(row.readAt).toBeNull()
  })

  it('expires old rows and evicts read rows before the oldest unread rows at the cap', async () => {
    const now = Date.now()
    const seededIds = Array.from({ length: 52 }, () => randomUUID())
    await prisma.inAppNotification.createMany({
      data: seededIds.map((id, i) => ({
        id, userId: ids[0], kind: InAppNotificationKind.announcement,
        createdAt: new Date(now - 60_000 + i * 100),
        readAt: i >= 50 ? new Date(now - 1000 + i) : null
      }))
    })
    await prisma.inAppNotification.create({
      data: {
        userId: ids[0], kind: InAppNotificationKind.announcement,
        createdAt: new Date(now - 2 * 86_400_000), dedupeKey: 'expired'
      }
    })
    await service.record([ids[0]], { kind: InAppNotificationKind.announcement, payload: {} })
    const rows = await prisma.inAppNotification.findMany({ where: { userId: ids[0] } })
    expect(rows).toHaveLength(50)
    expect(rows.some((row) => row.dedupeKey === 'expired')).toBe(false)
    for (const removed of [seededIds[0], seededIds[50], seededIds[51]]) {
      expect(rows.some((row) => row.id === removed)).toBe(false)
    }
    expect(rows.some((row) => row.id === seededIds[1])).toBe(true)
  })

  it('resolves channel overrides, server preferences and defaults in batches', async () => {
    await prisma.serverMember.updateMany({
      where: { serverId, userId: { in: ids.slice(0, 2) } }, data: { notifLevel: 'none' }
    })
    await prisma.serverMember.update({
      where: { userId_serverId: { userId: ids[2], serverId } }, data: { notifLevel: 'mentions' }
    })
    await prisma.channelNotifPref.create({ data: { userId: ids[1], channelId, level: 'all' } })
    await service.recordChannelMessage(ids.slice(0, 4), channelMessage)
    const rows = await prisma.inAppNotification.findMany({ where: { userId: { in: ids.slice(0, 4) } } })
    expect(rows.map((row) => row.userId).sort()).toEqual([ids[1], ids[3]].sort())
  })

  it('bulk mention increments preserve read receipts and count concurrent sends exactly once per user', async () => {
    const lastReadAt = new Date(Date.now() - 1000)
    await prisma.channelReadState.create({ data: { userId: ids[0], channelId, lastReadAt } })
    await Promise.all([
      readState.incrementMention(channelId, [ids[0], ids[1], ids[0]]),
      readState.incrementMention(channelId, [ids[0], ids[1]])
    ])
    const channelRows = await prisma.channelReadState.findMany({ where: { channelId } })
    expect(channelRows.map((row) => row.mentionCount)).toEqual([2, 2])
    expect(channelRows.find((row) => row.userId === ids[0])?.lastReadAt).toEqual(lastReadAt)
    expect(channelRows.find((row) => row.userId === ids[1])?.lastReadAt).toEqual(new Date(0))
    await Promise.all([
      readState.incrementDmMention(conversationId, [ids[0], ids[1]]),
      readState.incrementDmMention(conversationId, [ids[0], ids[1]])
    ])
    expect((await prisma.dmReadState.findMany({ where: { conversationId } }))
      .map((row) => row.mentionCount)).toEqual([2, 2])
  })

  it('matches single-user permissions for owners, admins and conflicting role overrides', async () => {
    const everyone = await prisma.role.create({
      data: { serverId, name: '@everyone', isDefault: true, permissions: Permission.VIEW_CHANNEL }
    })
    const allowed = await prisma.role.create({
      data: { serverId, name: 'Allowed', permissions: Permission.SEND_MESSAGES }
    })
    const admin = await prisma.role.create({
      data: { serverId, name: 'Admin', permissions: Permission.ADMINISTRATOR }
    })
    await prisma.serverMemberRole.createMany({
      data: [
        { serverId, userId: ids[2], roleId: allowed.id },
        { serverId, userId: ids[3], roleId: admin.id }
      ]
    })
    await prisma.channelPermissionOverride.createMany({
      data: [
        { channelId, roleId: everyone.id, deny: Permission.VIEW_CHANNEL },
        { channelId, roleId: allowed.id, allow: Permission.VIEW_CHANNEL }
      ]
    })
    const permissions = await roles.getChannelPermissionsForUsers(serverId, channelId, ids.slice(0, 4))
    for (const id of ids.slice(0, 4)) {
      expect(permissions.get(id)).toBe(await roles.getChannelPermissions(serverId, channelId, id))
    }
  })
})
