import { Test, TestingModule } from '@nestjs/testing'
import { parseSearchQuery, SearchService } from './search.service'
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
      getVisibleChannelIdsForServers: jest.fn().mockResolvedValue(new Map())
    }

    ;(prisma as any).$queryRaw = jest.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles }
      ]
    }).compile()

    service = module.get(SearchService)
  })

  describe('searchMessages', () => {
    it.each([
      ['has:video', "a.type = 'video'"],
      ['has:attachment', 'FROM attachments a'],
      ['has:file', "a.type = 'file'"],
      ['has:image', "a.type IN ('image', 'gif')"],
      ['has:link', 'm.content ~*'],
      ['has:poll', 'FROM polls p'],
      ['has:pinned', 'm.pinned = true'],
      ['in:thread', 'm.thread_parent_id IS NOT NULL'],
      ['in:root', 'm.thread_parent_id IS NULL'],
      ['tag:urgent', 'FROM forum_post_tags'],
      ['after:2026-10-01', 'm.created_at >='],
      ['before:2026-11-01', 'm.created_at <']
    ])('implements %s as a filter without requiring search text', async (query, fragment) => {
      prisma.directConversationMember.findFirst.mockResolvedValue({ userId })
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }])
      await service.searchMessages(userId, query, undefined, undefined, undefined, 'conv')
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
      const sql = prisma.$queryRaw.mock.calls[0][0].sql
      expect(sql).toContain(fragment)
      expect(sql).not.toContain('to_tsquery')
      expect(sql).toContain('m.deleted = false')
    })

    it('paginates channel and DM matches in one globally ordered query', async () => {
      prisma.serverMember.findMany.mockResolvedValue([{ serverId: 'server' }])
      prisma.directConversationMember.findMany.mockResolvedValue([{ conversationId: 'dm' }])
      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map([['server', ['channel']]]))
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 100n }])
      expect(
        await service.searchMessages(userId, 'has:attachment', undefined, undefined, undefined, undefined, 25, 25)
      ).toEqual({ results: [], total: 100 })
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
      const sql = prisma.$queryRaw.mock.calls[0][0]
      expect(sql.sql).toContain('ORDER BY m.created_at DESC, m.id DESC LIMIT')
      expect(sql.values).toEqual(expect.arrayContaining([['channel'], ['dm'], 25]))
      expect(sql.values.slice(-2)).toEqual([25, 25])
    })

    it('keeps user-provided filter values parameterized', async () => {
      prisma.directConversationMember.findFirst.mockResolvedValue({ userId })
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }])
      await service.searchMessages(userId, 'tag:"a\' OR true"', undefined, undefined, undefined, 'conv')
      const sql = prisma.$queryRaw.mock.calls[0][0]
      expect(sql.values).toContain("a' OR true")
      expect(sql.sql).not.toContain("a' OR true")
    })

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

      prisma.$queryRaw.mockResolvedValueOnce([{ id: 'msg-1' }]).mockResolvedValueOnce([{ count: 1n }])

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
          attachments: [{ id: 'att-1', type: 'image', url: '/uploads/x.png', thumbnailUrl: '/uploads/x-thumb.webp' }]
        }
      ])

      const result = await service.searchMessages(userId, 'hello', 's1', 'ch-1')
      expect(result.results).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.results[0].attachments).toEqual([
        { id: 'att-1', type: 'image', url: '/uploads/x.png', thumbnailUrl: '/uploads/x-thumb.webp' }
      ])
      const includeArg = prisma.message.findMany.mock.calls[0][0].include
      expect(includeArg.attachments).toBeDefined()
    })

    it('searches across all servers when no scope specified', async () => {
      prisma.serverMember.findMany.mockResolvedValue([{ serverId: 's1' }])
      prisma.directConversationMember.findMany.mockResolvedValue([])

      roles.getVisibleChannelIdsForServers.mockResolvedValue(new Map([['s1', ['ch-1']]]))

      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }])

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

      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }])

      const result = await service.searchMessages(userId, 'has:image')
      expect(result).toEqual({ results: [], total: 0 })
    })
  })

  describe('parseSearchQuery', () => {
    it('combines text, media, sender, date, thread and tag filters', () => {
      expect(
        parseSearchQuery(
          'hello has:video from:"Jane Doe" in:thread tag:"Bug report" after:2026-10-01 before:2026-11-01'
        )
      ).toMatchObject({
        text: 'hello',
        hasVideo: true,
        fromUsername: 'Jane Doe',
        location: 'thread',
        tag: 'Bug report',
        after: new Date('2026-10-01T00:00:00Z'),
        before: new Date('2026-11-01T00:00:00Z')
      })
    })
    it.each([
      'after:2026-02-30',
      'after:2025-02-29',
      'before:nope',
      'has:banana',
      'in:banana',
      'after:2026-11-01 before:2026-10-01',
      'from:',
      'from:@',
      'from:"Jane',
      'tag:""'
    ])('explicitly rejects invalid filters: %s', (query) => {
      expect(() => parseSearchQuery(query)).toThrow()
    })
    it('does not interpret URL fragments as search filters', () => {
      expect(parseSearchQuery('https://example.com/has:image').text).toBe('https://example.com/has:image')
    })
    it('preserves filter-like text inside quoted values', () => {
      expect(parseSearchQuery('tag:"Bug after:2026-10-01" from:"Jane has:image"')).toMatchObject({
        text: '',
        tag: 'Bug after:2026-10-01',
        fromUsername: 'Jane has:image',
        hasImage: false,
        after: null
      })
    })
    it('accepts leap days in valid years', () => {
      expect(parseSearchQuery('after:2024-02-29').after).toEqual(new Date('2024-02-29T00:00:00Z'))
    })
  })
})
