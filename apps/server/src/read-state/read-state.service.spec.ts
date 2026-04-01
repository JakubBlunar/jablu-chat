import { Test, TestingModule } from '@nestjs/testing'
import { ReadStateService } from './read-state.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('ReadStateService', () => {
  let service: ReadStateService
  let prisma: MockPrismaService
  let roles: { getAllChannelPermissions: jest.Mock }

  const userId = 'user-1'
  const serverId = 'server-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    roles = {
      getAllChannelPermissions: jest.fn().mockResolvedValue({}),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadStateService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(ReadStateService)
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
      prisma.channelReadState.upsert.mockResolvedValue(undefined)

      await service.ackServer(userId, serverId)

      expect(prisma.channelReadState.upsert).toHaveBeenCalledTimes(2)
    })

    it('does nothing when no visible channels', async () => {
      roles.getAllChannelPermissions.mockResolvedValue({ 'ch-1': 0n })
      await service.ackServer(userId, serverId)
      expect(prisma.channelReadState.upsert).not.toHaveBeenCalled()
    })
  })

  describe('incrementMention', () => {
    it('increments for each user', async () => {
      prisma.channelReadState.upsert.mockResolvedValue(undefined)
      await service.incrementMention('ch-1', ['u1', 'u2', 'u3'])
      expect(prisma.channelReadState.upsert).toHaveBeenCalledTimes(3)
    })

    it('does nothing for empty array', async () => {
      await service.incrementMention('ch-1', [])
      expect(prisma.channelReadState.upsert).not.toHaveBeenCalled()
    })
  })

  describe('incrementDmMention', () => {
    it('increments for each user', async () => {
      prisma.dmReadState.upsert.mockResolvedValue(undefined)
      await service.incrementDmMention('conv-1', ['u1', 'u2'])
      expect(prisma.dmReadState.upsert).toHaveBeenCalledTimes(2)
    })
  })

  describe('resolveMentions', () => {
    const members = [
      {
        userId: 'u-alice',
        user: { id: 'u-alice', username: 'alice', displayName: 'Alice Smith' },
        roles: [{ role: { permissions: 0n } }],
      },
      {
        userId: 'u-bob',
        user: { id: 'u-bob', username: 'bob', displayName: null },
        roles: [{ role: { permissions: 0n } }],
      },
      {
        userId: 'u-admin',
        user: { id: 'u-admin', username: 'admin', displayName: null },
        roles: [{ role: { permissions: (1n << 11n) } }], // ADMINISTRATOR
      },
    ]

    beforeEach(() => {
      prisma.serverMember.findMany.mockResolvedValue(members)
    })

    it('resolves @username mentions', async () => {
      const result = await service.resolveMentions('hey @alice', serverId, 'u-bob')
      expect(result.userIds).toEqual(['u-alice'])
      expect(result.everyone).toBe(false)
      expect(result.here).toBe(false)
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
  })
})
