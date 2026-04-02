import { UnauthorizedException } from '@nestjs/common'
import { createMockPrismaService, type MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, type MockRedisService } from '../__mocks__/redis.mock'
import { BotTokenStrategy, hashBotToken } from './bot-token.strategy'

describe('BotTokenStrategy', () => {
  let strategy: BotTokenStrategy
  let prisma: MockPrismaService
  let redis: MockRedisService

  beforeEach(() => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    ;(redis.client as any).status = 'ready'
    redis.client.get.mockResolvedValue(null)
    redis.client.set.mockResolvedValue('OK')
    strategy = new BotTokenStrategy(prisma as any, redis as any)
  })

  it('validates a valid bot token', async () => {
    const token = 'bot_abc123'
    const tokenHash = hashBotToken(token)

    prisma.botApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      user: { id: 'bot-user-1', username: 'testbot', displayName: 'Test Bot', isBot: true }
    })

    const result = await strategy.validate({ headers: { authorization: `Bot ${token}` } })
    expect(result.id).toBe('bot-user-1')
    expect(result.isBot).toBe(true)
    expect(result.botAppId).toBe('app-1')
    expect(prisma.botApplication.findFirst).toHaveBeenCalledWith({
      where: { tokenHash },
      select: {
        id: true,
        user: { select: { id: true, username: true, displayName: true, isBot: true } }
      }
    })
  })

  it('rejects missing authorization header', async () => {
    await expect(strategy.validate({ headers: {} }))
      .rejects.toThrow(UnauthorizedException)
  })

  it('rejects non-Bot prefix', async () => {
    await expect(strategy.validate({ headers: { authorization: 'Bearer jwt123' } }))
      .rejects.toThrow(UnauthorizedException)
  })

  it('rejects empty token after Bot prefix', async () => {
    await expect(strategy.validate({ headers: { authorization: 'Bot ' } }))
      .rejects.toThrow(UnauthorizedException)
  })

  it('rejects invalid token (not found in DB)', async () => {
    prisma.botApplication.findFirst.mockResolvedValue(null)
    await expect(strategy.validate({ headers: { authorization: 'Bot invalid_token' } }))
      .rejects.toThrow(UnauthorizedException)
  })

  it('returns cached user on cache hit', async () => {
    const cachedUser = { id: 'bot-user-1', username: 'testbot', email: 'e', isBot: true, botAppId: 'app-1' }
    redis.client.get.mockResolvedValue(JSON.stringify(cachedUser))

    const result = await strategy.validate({ headers: { authorization: 'Bot token123' } })
    expect(result).toEqual(cachedUser)
    expect(prisma.botApplication.findFirst).not.toHaveBeenCalled()
  })

  it('caches the result after DB lookup', async () => {
    prisma.botApplication.findFirst.mockResolvedValue({
      id: 'app-1',
      user: { id: 'bot-1', username: 'b', email: 'e', isBot: true }
    })

    await strategy.validate({ headers: { authorization: 'Bot mytoken' } })
    expect(redis.client.set).toHaveBeenCalled()
  })
})

describe('hashBotToken', () => {
  it('produces a consistent hash', () => {
    const hash1 = hashBotToken('test_token')
    const hash2 = hashBotToken('test_token')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different tokens', () => {
    expect(hashBotToken('token_a')).not.toBe(hashBotToken('token_b'))
  })

  it('returns a hex string', () => {
    expect(hashBotToken('anything')).toMatch(/^[0-9a-f]{64}$/)
  })
})
