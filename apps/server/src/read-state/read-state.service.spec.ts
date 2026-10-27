import { Test, TestingModule } from '@nestjs/testing'
import { ReadStateService } from './read-state.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('ReadStateService', () => {
  let service: ReadStateService
  let prisma: MockPrismaService
  let roles: { getAllChannelPermissions: jest.Mock; getVisibleChannelIdsForServers: jest.Mock }
  let inApp: {
    markChannelRead: jest.Mock
    markServerChannelsRead: jest.Mock
    markDmRead: jest.Mock
  }

  const userId = 'user-1'
  const serverId = 'server-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    roles = {
      getAllChannelPermissions: jest.fn().mockResolvedValue({}),
      getVisibleChannelIdsForServers: jest.fn().mockResolvedValue(new Map()),
    }
    inApp = {
      markChannelRead: jest.fn().mockResolvedValue(undefined),
      markServerChannelsRead: jest.fn().mockResolvedValue(undefined),
      markDmRead: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadStateService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
        { provide: InAppNotificationsService, useValue: inApp },
      ],
    }).compile()

    service = module.get(ReadStateService)
  })

  describe('getAllForUser', () => {
    it('preserves a manual unread marker without rewinding the read receipt', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{
        conversation_id: 'dm', marked_unread: true, last_read_at: new Date('2026-10-17T10:00:00Z'),
        mention_count: 0, unread_count: 0n, first_unread_message_id: null
      }])
      const result = await service.getAllForUser(userId)
      expect(result.dms[0]).toMatchObject({ unreadCount: 1, lastReadAt: '2026-10-17T10:00:00.000Z' })
    })

    it('queries membership-backed channels and DMs even without an existing read-state row', async () => {
      prisma.$queryRaw.mockResolvedValue([])
      await service.getAllForUser(userId)
      const channelSql = prisma.$queryRaw.mock.calls[0][0].join('?')
      const dmSql = prisma.$queryRaw.mock.calls[1][0].join('?')
      expect(channelSql).toContain('FROM channels c')
      expect(channelSql).toContain('JOIN server_members sm')
      expect(channelSql).toContain('LEFT JOIN channel_read_states')
      expect(channelSql).toContain('COALESCE(crs.last_read_at, sm.joined_at)')
      expect(dmSql).toContain('FROM direct_conversation_members dcm')
      expect(dmSql).toContain('LEFT JOIN dm_read_states')
      expect(dmSql).toContain('COALESCE(drs.last_read_at, dcm.joined_at)')
    })

    it('includes firstUnreadMessageId for channels and DMs', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            channel_id: 'ch-1',
            last_read_at: new Date('2025-01-01T00:00:00Z'),
            mention_count: 1,
            server_id: 'server-1',
            unread_count: 3n,
            first_unread_message_id: 'msg-100',
          },
          {
            channel_id: 'ch-2',
            last_read_at: new Date('2025-01-01T00:00:00Z'),
            mention_count: 0,
            server_id: 'server-1',
            unread_count: 0n,
            first_unread_message_id: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            conversation_id: 'conv-1',
            last_read_at: new Date('2025-01-01T00:00:00Z'),
            mention_count: 2,
            unread_count: 5n,
            first_unread_message_id: 'msg-dm-200',
          },
        ])

      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map([['server-1', ['ch-1', 'ch-2']]]))

      const result = await service.getAllForUser(userId)

      expect(result.channels).toEqual([
        expect.objectContaining({
          channelId: 'ch-1',
          unreadCount: 3,
          firstUnreadMessageId: 'msg-100',
        }),
        expect.objectContaining({
          channelId: 'ch-2',
          unreadCount: 0,
          firstUnreadMessageId: null,
        }),
      ])
      expect(result.dms).toEqual([
        expect.objectContaining({
          conversationId: 'conv-1',
          unreadCount: 5,
          firstUnreadMessageId: 'msg-dm-200',
        }),
      ])
    })

    it('batches visibility for many servers and filters hidden or departed channels', async () => {
      const rows = Array.from({ length: 50 }, (_, i) => ({
        channel_id: `ch-${i}`,
        last_read_at: new Date('2026-01-01T00:00:00Z'),
        mention_count: 1,
        server_id: `server-${i}`,
        unread_count: 3n,
        first_unread_message_id: `msg-${i}`,
      }))
      prisma.$queryRaw.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map(
        rows.filter((_, i) => i % 2 === 0).map((r) => [r.server_id, [r.channel_id]]),
      ))

      const result = await service.getAllForUser(userId)

      expect(result.channels.map((c) => c.channelId)).toEqual(
        rows.filter((_, i) => i % 2 === 0).map((r) => r.channel_id),
      )
      expect(roles.getVisibleChannelIdsForServers).toHaveBeenCalledTimes(1)
      expect(roles.getVisibleChannelIdsForServers).toHaveBeenCalledWith(userId, rows.map((r) => r.server_id))
      expect(roles.getAllChannelPermissions).not.toHaveBeenCalled()
    })

    it('surfaces permission query failures instead of silently returning incomplete badges', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{
        channel_id: 'ch-1',
        last_read_at: new Date('2026-01-01T00:00:00Z'),
        mention_count: 0,
        server_id: serverId,
        unread_count: 0n,
        first_unread_message_id: null,
      }]).mockResolvedValueOnce([])
      roles.getVisibleChannelIdsForServers.mockRejectedValue(new Error('Database unavailable'))
      await expect(service.getAllForUser(userId)).rejects.toThrow('Database unavailable')
    })
  })

  describe('ackChannel', () => {
    it('upserts with zero mentions and current timestamp', async () => {
      prisma.channelReadState.upsert.mockResolvedValue(undefined)
      await service.ackChannel(userId, 'ch-1')

      expect(prisma.channelReadState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_channelId: { userId, channelId: 'ch-1' } },
          update: expect.objectContaining({ mentionCount: 0 }),
        }),
      )
    })
  })

  describe('ackDm', () => {
    it('upserts DM read state', async () => {
      prisma.dmReadState.upsert.mockResolvedValue(undefined)
      await service.ackDm(userId, 'conv-1')

      expect(prisma.dmReadState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_conversationId: { userId, conversationId: 'conv-1' } },
        }),
      )
    })
  })

  describe('ackServer', () => {
    it('acks all visible channels for the server', async () => {
      const VIEW = 4096n // Permission.VIEW_CHANNEL
      roles.getAllChannelPermissions.mockResolvedValue({
        'ch-1': VIEW,
        'ch-2': VIEW,
        'ch-3': 0n,
      })
      prisma.$executeRaw.mockResolvedValue(1)

      await service.ackServer(userId, serverId)

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2)
      expect(prisma.$executeRaw.mock.calls[1][0].join('?')).toContain('INSERT INTO inbox_thread_read_states')
      expect(prisma.$executeRaw.mock.calls[1]).toContainEqual(['ch-1', 'ch-2'])
      expect(prisma.channelReadState.upsert).not.toHaveBeenCalled()
    })

    it('does nothing when no visible channels', async () => {
      roles.getAllChannelPermissions.mockResolvedValue({ 'ch-1': 0n })
      await service.ackServer(userId, serverId)
      expect(prisma.$executeRaw).not.toHaveBeenCalled()
    })
  })

  describe('incrementMention', () => {
    it('increments all distinct recipients with one atomic statement', async () => {
      await service.incrementMention('ch-1', ['u1', 'u2', 'u1', 'u3'])
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
      expect(prisma.$executeRaw.mock.calls[0]).toContainEqual(['u1', 'u2', 'u3'])
      expect(prisma.$executeRaw.mock.calls[0][0].join('?')).toContain(
        'mention_count = channel_read_states.mention_count + 1'
      )
      expect(prisma.channelReadState.upsert).not.toHaveBeenCalled()
    })

    it('does nothing for empty array', async () => {
      await service.incrementMention('ch-1', [])
      expect(prisma.$executeRaw).not.toHaveBeenCalled()
    })
  })

  describe('incrementDmMention', () => {
    it('increments all recipients with one atomic statement', async () => {
      await service.incrementDmMention('conv-1', ['u1', 'u2'])
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
      expect(prisma.$executeRaw.mock.calls[0][0].join('?')).toContain(
        'mention_count = dm_read_states.mention_count + 1'
      )
    })
  })

  describe('resolveMentions', () => {
    const members = [
      {
        userId: 'u-alice',
        user: { id: 'u-alice', username: 'alice', displayName: 'Alice Smith' },
        roles: [
          { role: { id: 'r-mem', permissions: 0n, name: 'Member', isDefault: true } }
        ]
      },
      {
        userId: 'u-bob',
        user: { id: 'u-bob', username: 'bob', displayName: null },
        roles: [
          { role: { id: 'r-mem', permissions: 0n, name: 'Member', isDefault: true } },
          { role: { id: 'r-mod', permissions: 0n, name: 'Moderators', isDefault: false } }
        ]
      },
      {
        userId: 'u-admin',
        user: { id: 'u-admin', username: 'admin', displayName: null },
        roles: [{ role: { id: 'r-adm', permissions: 1n << 11n, name: 'Admin', isDefault: false } }] // ADMINISTRATOR
      },
      {
        userId: 'u-plain',
        user: { id: 'u-plain', username: 'plain', displayName: null },
        roles: [{ role: { id: 'r-mem2', permissions: 0n, name: 'Member', isDefault: true } }]
      }
    ]

    beforeEach(() => {
      prisma.serverMember.findUnique.mockImplementation(async args => members.find(m => m.userId === args.where.userId_serverId.userId) ?? null)
      prisma.$queryRaw.mockResolvedValue(members.map(m => ({ userId: m.userId, username: m.user.username, displayName: m.user.displayName, serverName: null })))
      prisma.role.findMany.mockImplementation(async args => members.flatMap(m => m.roles.map(r => r.role))
        .filter(r => !r.isDefault && args.where.OR.some((condition: { name: { equals: string } }) => condition.name.equals === r.name.toLowerCase())))
      prisma.serverMember.findMany.mockImplementation(async args => {
        const roleIds = args.where.roles?.some.roleId.in as string[] | undefined
        return roleIds ? members.filter(m => m.roles.some(r => roleIds.includes(r.role.id))) : members
      })
    })

    it('resolves @username mentions', async () => {
      const result = await service.resolveMentions('hey @alice', serverId, 'u-bob')
      expect(result.userIds).toEqual(['u-alice'])
      expect(result.everyone).toBe(false)
      expect(result.here).toBe(false)
      expect(prisma.serverMember.findMany).not.toHaveBeenCalled()
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it('reuses assigned-role mention permissions from an authorized send attempt', async () => {
      const result = await service.resolveMentions('hey @alice', serverId, 'u-bob', [], 0n)
      expect(result.userIds).toEqual(['u-alice'])
      expect(prisma.serverMember.findUnique).not.toHaveBeenCalled()
      expect(prisma.serverMember.findMany).not.toHaveBeenCalled()
    })

    it('resolves server names and still accepts global names and usernames', async () => {
      prisma.$queryRaw.mockResolvedValue(members.map(m => ({ userId: m.userId, username: m.user.username,
        displayName: m.user.displayName, serverName: m.userId === 'u-alice' ? 'Server Alice' : null })))
      for (const content of ['@"Server Alice"', '@"Alice Smith"', '@alice']) {
        expect((await service.resolveMentions(content, serverId, 'u-bob')).userIds).toEqual(['u-alice'])
      }
    })

    it('resolves case-insensitively', async () => {
      const result = await service.resolveMentions('hey @ALICE', serverId, 'u-bob')
      expect(result.userIds).toEqual(['u-alice'])
    })

    it('resolves @displayName', async () => {
      const result = await service.resolveMentions('hey @"Alice Smith"', serverId, 'u-bob')
      expect(result.userIds).toEqual(['u-alice'])
    })

    it('excludes the sender', async () => {
      const result = await service.resolveMentions('hey @alice', serverId, 'u-alice')
      expect(result.userIds).toEqual([])
    })

    it('returns empty when no mentions found', async () => {
      const result = await service.resolveMentions('no mentions here', serverId, 'u-bob')
      expect(result.userIds).toEqual([])
    })

    it('@everyone resolves for admin users', async () => {
      const result = await service.resolveMentions('hey @everyone', serverId, 'u-admin')
      expect(result.everyone).toBe(true)
      expect(result.userIds).toContain('u-alice')
      expect(result.userIds).toContain('u-bob')
      expect(result.userIds).toContain('u-plain')
      expect(result.userIds).not.toContain('u-admin')
    })

    it('@everyone does NOT resolve for non-admin users', async () => {
      const result = await service.resolveMentions('hey @everyone', serverId, 'u-bob')
      expect(result.everyone).toBe(false)
      expect(result.userIds).toEqual([])
    })

    it('@here resolves for privileged users when online IDs provided', async () => {
      const result = await service.resolveMentions(
        'hey @here',
        serverId,
        'u-admin',
        ['u-alice'],
      )
      expect(result.here).toBe(true)
      expect(result.userIds).toEqual(['u-alice'])
    })

    it('@here does NOT resolve for non-privileged users', async () => {
      const result = await service.resolveMentions('hey @here', serverId, 'u-bob', ['u-alice'])
      expect(result.here).toBe(false)
      expect(result.userIds).toEqual([])
    })

    it('@role resolves members with that role for privileged senders', async () => {
      const result = await service.resolveMentions('ping @Moderators', serverId, 'u-admin')
      expect(result.everyone).toBe(false)
      expect(result.userIds).toContain('u-bob')
      expect(result.userIds).not.toContain('u-admin')
      expect(result.userIds).not.toContain('u-alice')
    })

    it('@role does not resolve for members without mention-everyone permission', async () => {
      const result = await service.resolveMentions('ping @Moderators', serverId, 'u-plain')
      expect(result.userIds).toEqual([])
    })

    it('quoted @"Role Name" resolves as role when no display name match', async () => {
      const result = await service.resolveMentions('hi @"Moderators"', serverId, 'u-admin')
      expect(result.userIds).toContain('u-bob')
    })

    it('user display name wins over same-shaped role in quoted mentions', async () => {
      const result = await service.resolveMentions('hey @"Alice Smith"', serverId, 'u-bob')
      expect(result.userIds).toEqual(['u-alice'])
    })
  })
})
