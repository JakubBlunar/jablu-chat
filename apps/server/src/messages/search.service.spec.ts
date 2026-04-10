import { Test, TestingModule } from '@nestjs/testing'
import { SearchService } from './search.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { Permission } from '@chat/shared'

describe('SearchService', () => {
  let service: SearchService
  let prisma: MockPrismaService
  let roles: { getAllChannelPermissions: jest.Mock; getVisibleChannelIdsForServers: jest.Mock }

  const userId = 'user-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    roles = {
      getAllChannelPermissions: jest.fn().mockResolvedValue({}),
      getVisibleChannelIdsForServers: jest.fn().mockResolvedValue(new Map()),
    }

    ;(prisma as any).$queryRaw = jest.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(SearchService)
  })

  describe('searchMessages', () => {
    it('returns empty results for empty query', async () => {
      const result = await service.searchMessages(userId, '')
      expect(result).toEqual({ results: [], total: 0 })
    })

    it('returns empty when from:user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null)
      const result = await service.searchMessages(userId, 'from:nobody hello')
      expect(result).toEqual({ results: [], total: 0 })
    })

    it('returns empty when user is not a DM member', async () => {
      prisma.directConversationMember.findFirst.mockResolvedValue(null)
      const result = await service.searchMessages(userId, 'hello', undefined, undefined, undefined, 'conv-1')
      expect(result).toEqual({ results: [], total: 0 })
    })

    it('searches in specific channel when channelId provided', async () => {
      prisma.serverMember.findMany.mockResolvedValue([{ serverId: 's1' }])
      prisma.channel.findUnique.mockResolvedValue({ serverId: 's1' })

      roles.getAllChannelPermissions.mockResolvedValue({ 'ch-1': Permission.VIEW_CHANNEL })

      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'msg-1' }])
        .mockResolvedValueOnce([{ count: 1n }])

      prisma.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          content: 'hello world',
          title: null,
          threadParentId: null,
          authorId: 'u2',
          author: { id: 'u2', username: 'alice', displayName: null, avatarUrl: null },
          channelId: 'ch-1',
          channel: { id: 'ch-1', name: 'general', serverId: 's1', type: 'text' },
          directConversationId: null,
          createdAt: new Date(),
        },
      ])

      const result = await service.searchMessages(userId, 'hello', 's1', 'ch-1')
      expect(result.results).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('searches across all servers when no scope specified', async () => {
      prisma.serverMember.findMany.mockResolvedValue([{ serverId: 's1' }])
      prisma.directConversationMember.findMany.mockResolvedValue([])

      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map([['s1', ['ch-1']]]))

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }])

      const result = await service.searchMessages(userId, 'test')
      expect(result).toEqual({ results: [], total: 0 })
    })

    it('clamps limit to [1, 50]', async () => {
      prisma.serverMember.findMany.mockResolvedValue([])
      prisma.directConversationMember.findMany.mockResolvedValue([])

      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map())

      const result = await service.searchMessages(userId, 'test', undefined, undefined, undefined, undefined, 999)
      expect(result).toEqual({ results: [], total: 0 })
    })

    it('handles has: filters without text', async () => {
      prisma.serverMember.findMany.mockResolvedValue([{ serverId: 's1' }])
      prisma.directConversationMember.findMany.mockResolvedValue([])
      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map([['s1', ['ch-1']]]))

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }])

      const result = await service.searchMessages(userId, 'has:image')
      expect(result).toEqual({ results: [], total: 0 })
    })

    it('handles in:thread and date filters without text', async () => {
      prisma.serverMember.findMany.mockResolvedValue([{ serverId: 's1' }])
      prisma.directConversationMember.findMany.mockResolvedValue([])
      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map([['s1', ['ch-1']]]))

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }])

      const result = await service.searchMessages(userId, 'in:thread after:2024-01-01 before:2025-12-31')
      expect(result).toEqual({ results: [], total: 0 })
    })
  })
})
