import { Test, TestingModule } from '@nestjs/testing'
import { AutoModService } from './automod.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'
import { EventBusService } from '../events/event-bus.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

describe('AutoModService', () => {
  let service: AutoModService
  let prisma: MockPrismaService
  let redis: MockRedisService
  let events: { emit: jest.Mock }
  let roles: { requirePermission: jest.Mock }

  beforeEach(async () => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    events = { emit: jest.fn() }
    roles = { requirePermission: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoModService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: RolesService, useValue: roles },
        { provide: EventBusService, useValue: events },
      ],
    }).compile()

    service = module.get(AutoModService)
  })

  describe('checkMessage', () => {
    it('allows a message when no rules exist', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([])
      const result = await service.checkMessage('server1', 'user1', 'hello world')
      expect(result).toEqual({ allowed: true })
    })

    it('blocks a message matching a word_filter with block action', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule1',
          type: 'word_filter',
          enabled: true,
          config: { words: ['badword'], action: 'block' },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'this has badword in it')
      expect(result).toEqual({ allowed: false, reason: 'Message contains a blocked word' })
    })

    it('flags a message matching a word_filter with flag action', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule1',
          type: 'word_filter',
          enabled: true,
          config: { words: ['suspect'], action: 'flag' },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'this is suspect content', {
        channelId: 'ch1',
        messageId: 'msg1',
      })
      expect(result).toEqual({ allowed: true })
      expect(events.emit).toHaveBeenCalledWith('automod:flagged', {
        serverId: 'server1',
        userId: 'user1',
        channelId: 'ch1',
        messageId: 'msg1',
        reason: 'Contains flagged word: "suspect"',
        content: 'this is suspect content',
      })
    })

    it('blocks a message with a link when link_filter blocks all', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule2',
          type: 'link_filter',
          enabled: true,
          config: { blockAll: true, allowedDomains: [] },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'check https://example.com')
      expect(result).toEqual({ allowed: false, reason: 'Links are not allowed in this server' })
    })

    it('allows a link from an allowed domain', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule2',
          type: 'link_filter',
          enabled: true,
          config: { blockAll: true, allowedDomains: ['example.com'] },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'check https://example.com/page')
      expect(result).toEqual({ allowed: true })
    })

    it('blocks when rate limit exceeded via spam_detection', async () => {
      redis.client.incr.mockResolvedValueOnce(11) // rate count > 10
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule3',
          type: 'spam_detection',
          enabled: true,
          config: { maxDuplicates: 3, windowSeconds: 60, maxMessagesPerMinute: 10 },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'some message')
      expect(result).toEqual({ allowed: false, reason: 'You are sending messages too quickly' })
    })

    it('blocks when duplicate count exceeded via spam_detection', async () => {
      redis.client.incr
        .mockResolvedValueOnce(1) // rate count = 1 (ok)
        .mockResolvedValueOnce(4) // dupe count = 4 (> maxDuplicates 3)
      redis.client.expire.mockResolvedValue(1)
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule3',
          type: 'spam_detection',
          enabled: true,
          config: { maxDuplicates: 3, windowSeconds: 60, maxMessagesPerMinute: 10 },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'repeated msg')
      expect(result).toEqual({ allowed: false, reason: 'Duplicate message detected' })
    })

    it('allows when spam_detection counts are within limits', async () => {
      redis.client.incr
        .mockResolvedValueOnce(5) // rate count (ok)
        .mockResolvedValueOnce(2) // dupe count (ok)
      redis.client.expire.mockResolvedValue(1)
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule3',
          type: 'spam_detection',
          enabled: true,
          config: { maxDuplicates: 3, windowSeconds: 60, maxMessagesPerMinute: 10 },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'a normal message')
      expect(result).toEqual({ allowed: true })
    })

    it('checks multiple rules and stops on first block', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule1',
          type: 'word_filter',
          enabled: true,
          config: { words: ['blocked'], action: 'block' },
        },
        {
          id: 'rule2',
          type: 'link_filter',
          enabled: true,
          config: { blockAll: true, allowedDomains: [] },
        },
      ])
      const result = await service.checkMessage('server1', 'user1', 'blocked https://evil.com')
      expect(result).toEqual({ allowed: false, reason: 'Message contains a blocked word' })
    })
  })

  describe('word filter (via checkMessage)', () => {
    beforeEach(() => {
      redis.client.incr.mockResolvedValue(1)
      redis.client.expire.mockResolvedValue(1)
    })

    it('is case-insensitive', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'r',
          type: 'word_filter',
          enabled: true,
          config: { words: ['BadWord'], action: 'block' },
        },
      ])
      const result = await service.checkMessage('s', 'u', 'I said BADWORD here')
      expect(result.allowed).toBe(false)
    })

    it('allows messages with no matching words', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'r',
          type: 'word_filter',
          enabled: true,
          config: { words: ['forbidden'], action: 'block' },
        },
      ])
      const result = await service.checkMessage('s', 'u', 'perfectly fine message')
      expect(result.allowed).toBe(true)
    })

    it('allows when words list is empty', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'r',
          type: 'word_filter',
          enabled: true,
          config: { words: [], action: 'block' },
        },
      ])
      const result = await service.checkMessage('s', 'u', 'anything goes')
      expect(result.allowed).toBe(true)
    })
  })

  describe('link filter (via checkMessage)', () => {
    beforeEach(() => {
      redis.client.incr.mockResolvedValue(1)
      redis.client.expire.mockResolvedValue(1)
    })

    it('allows messages with no URLs regardless of config', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'r',
          type: 'link_filter',
          enabled: true,
          config: { blockAll: true, allowedDomains: [] },
        },
      ])
      const result = await service.checkMessage('s', 'u', 'no links here')
      expect(result.allowed).toBe(true)
    })

    it('allows URLs when blockAll is false', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'r',
          type: 'link_filter',
          enabled: true,
          config: { blockAll: false, allowedDomains: [] },
        },
      ])
      const result = await service.checkMessage('s', 'u', 'https://anything.com')
      expect(result.allowed).toBe(true)
    })

    it('allows subdomains of allowed domains', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'r',
          type: 'link_filter',
          enabled: true,
          config: { blockAll: true, allowedDomains: ['example.com'] },
        },
      ])
      const result = await service.checkMessage('s', 'u', 'https://sub.example.com/page')
      expect(result.allowed).toBe(true)
    })

    it('blocks URLs not in allowed domains', async () => {
      prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'r',
          type: 'link_filter',
          enabled: true,
          config: { blockAll: true, allowedDomains: ['safe.com'] },
        },
      ])
      const result = await service.checkMessage('s', 'u', 'check https://evil.com/malware')
      expect(result.allowed).toBe(false)
    })
  })

  describe('getRule', () => {
    it('returns the stored rule when found', async () => {
      prisma.autoModRule.findUnique.mockResolvedValue({
        id: 'rule1',
        type: 'word_filter',
        enabled: true,
        config: { words: ['test'], action: 'block' },
      })
      const result = await service.getRule('server1', 'word_filter' as any)
      expect(result).toEqual({
        id: 'rule1',
        type: 'word_filter',
        enabled: true,
        config: { words: ['test'], action: 'block' },
      })
    })

    it('returns default config when rule not found', async () => {
      prisma.autoModRule.findUnique.mockResolvedValue(null)
      const result = await service.getRule('server1', 'word_filter' as any)
      expect(result).toEqual({
        id: null,
        type: 'word_filter',
        enabled: false,
        config: { words: [], action: 'block' },
      })
    })

    it('returns default spam_detection config when not found', async () => {
      prisma.autoModRule.findUnique.mockResolvedValue(null)
      const result = await service.getRule('server1', 'spam_detection' as any)
      expect(result).toEqual({
        id: null,
        type: 'spam_detection',
        enabled: false,
        config: { maxDuplicates: 3, windowSeconds: 60, maxMessagesPerMinute: 10 },
      })
    })
  })

  describe('upsertRule', () => {
    it('checks MANAGE_SERVER permission before upsert', async () => {
      roles.requirePermission.mockResolvedValue(undefined)
      prisma.autoModRule.upsert.mockResolvedValue({
        id: 'rule1',
        type: 'word_filter',
        enabled: true,
        config: { words: ['bad'], action: 'block' },
      })

      await service.upsertRule('server1', 'user1', 'word_filter' as any, true, {
        words: ['bad'],
        action: 'block',
      })

      expect(roles.requirePermission).toHaveBeenCalledWith(
        'server1',
        'user1',
        expect.anything(),
      )
    })

    it('returns the upserted rule', async () => {
      roles.requirePermission.mockResolvedValue(undefined)
      prisma.autoModRule.upsert.mockResolvedValue({
        id: 'rule1',
        type: 'link_filter',
        enabled: false,
        config: { blockAll: false, allowedDomains: [] },
      })

      const result = await service.upsertRule('server1', 'user1', 'link_filter' as any, false, {
        blockAll: false,
        allowedDomains: [],
      })
      expect(result).toEqual({
        id: 'rule1',
        type: 'link_filter',
        enabled: false,
        config: { blockAll: false, allowedDomains: [] },
      })
    })
  })
})
