import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { createMockPrismaService, type MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService } from '../__mocks__/redis.mock'
import { BotsService } from './bots.service'
import { EventBusService } from '../events/event-bus.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'
import { hashBotToken } from '../auth/bot-token.strategy'

describe('BotsService', () => {
  let service: BotsService
  let prisma: MockPrismaService
  let events: { emit: jest.Mock }
  let roles: { requirePermission: jest.Mock; getDefaultRoleId: jest.Mock }

  beforeEach(() => {
    prisma = createMockPrismaService()
    events = { emit: jest.fn() }
    roles = { requirePermission: jest.fn(), getDefaultRoleId: jest.fn().mockResolvedValue('role-1') }
    const redis = createMockRedisService()
    ;(redis.client as any).status = 'ready'
    redis.client.del.mockResolvedValue(1)
    service = new BotsService(
      prisma as any,
      events as unknown as EventBusService,
      roles as unknown as RolesService,
      redis as unknown as RedisService
    )
  })

  describe('createBot', () => {
    it('creates a bot user and application', async () => {
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const txPrisma = createMockPrismaService()
        txPrisma.user.create.mockResolvedValue({
          id: 'bot-user-1',
          username: 'testbot',
          email: 'bot@bot.internal',
          displayName: 'Test Bot',
          isBot: true
        })
        txPrisma.botApplication.create.mockResolvedValue({
          id: 'app-1',
          name: 'Test Bot',
          description: null,
          userId: 'bot-user-1',
          ownerId: 'owner-1',
          tokenHash: 'hash',
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 'bot-user-1', username: 'testbot', displayName: 'Test Bot', avatarUrl: null }
        })
        return fn(txPrisma)
      })

      const result = await service.createBot('owner-1', 'testbot', 'Test Bot')
      expect(result.token).toBeDefined()
      expect(result.token).toMatch(/^bot_/)
      expect(result.name).toBe('Test Bot')
      expect(result.user.username).toBe('testbot')
    })

    it('rejects invalid usernames', async () => {
      await expect(service.createBot('owner-1', 'A', 'Bot'))
        .rejects.toThrow(BadRequestException)
    })

    it('rejects taken usernames', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' })
      await expect(service.createBot('owner-1', 'taken_name', 'Bot'))
        .rejects.toThrow(ConflictException)
    })
  })

  describe('listOwnBots', () => {
    it('returns bots owned by the user', async () => {
      prisma.botApplication.findMany.mockResolvedValue([
        {
          id: 'app-1', name: 'Bot1', description: null,
          userId: 'bot-1', ownerId: 'owner-1',
          createdAt: new Date(), updatedAt: new Date(),
          user: { id: 'bot-1', username: 'bot1', displayName: 'Bot1', avatarUrl: null }
        }
      ])
      const result = await service.listOwnBots('owner-1')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Bot1')
    })
  })

  describe('deleteBot', () => {
    it('deletes bot and user', async () => {
      prisma.botApplication.findUnique.mockResolvedValue({
        id: 'app-1', ownerId: 'owner-1', userId: 'bot-1',
        user: { id: 'bot-1', username: 'b', displayName: 'B', avatarUrl: null }
      })
      prisma.$transaction.mockResolvedValue(undefined)
      await service.deleteBot('app-1', 'owner-1')
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it('rejects non-owner', async () => {
      prisma.botApplication.findUnique.mockResolvedValue({
        id: 'app-1', ownerId: 'other-user', userId: 'bot-1',
        user: { id: 'bot-1', username: 'b', displayName: 'B', avatarUrl: null }
      })
      await expect(service.deleteBot('app-1', 'owner-1'))
        .rejects.toThrow(ForbiddenException)
    })

    it('throws if bot not found', async () => {
      prisma.botApplication.findUnique.mockResolvedValue(null)
      await expect(service.deleteBot('nope', 'owner-1'))
        .rejects.toThrow(NotFoundException)
    })
  })

  describe('addBotToServer', () => {
    it('adds public bot to server', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'bot-1', isBot: true })
      prisma.botApplication.findUnique.mockResolvedValue({ public: true, ownerId: 'other-owner' })
      prisma.serverMember.findUnique.mockResolvedValue(null)
      prisma.server.findUnique.mockResolvedValue({ onboardingEnabled: false })
      prisma.serverMember.create.mockResolvedValue({
        userId: 'bot-1', serverId: 'server-1', joinedAt: new Date(),
        user: { id: 'bot-1', username: 'bot', displayName: 'Bot', avatarUrl: null, bio: null, status: 'online', isBot: true }
      })
      prisma.serverMemberRole.create.mockResolvedValue({})

      const result = await service.addBotToServer('server-1', 'actor-1', 'bot')
      expect(result.userId).toBe('bot-1')
      expect(events.emit).toHaveBeenCalledWith('member:joined', expect.any(Object))
    })

    it('allows owner to add private bot', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'bot-1', isBot: true })
      prisma.botApplication.findUnique.mockResolvedValue({ public: false, ownerId: 'actor-1' })
      prisma.serverMember.findUnique.mockResolvedValue(null)
      prisma.server.findUnique.mockResolvedValue({ onboardingEnabled: false })
      prisma.serverMember.create.mockResolvedValue({
        userId: 'bot-1', serverId: 'server-1', joinedAt: new Date(),
        user: { id: 'bot-1', username: 'bot', displayName: 'Bot', avatarUrl: null, bio: null, status: 'online', isBot: true }
      })
      prisma.serverMemberRole.create.mockResolvedValue({})

      const result = await service.addBotToServer('server-1', 'actor-1', 'bot')
      expect(result.userId).toBe('bot-1')
    })

    it('rejects private bot from non-owner', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'bot-1', isBot: true })
      prisma.botApplication.findUnique.mockResolvedValue({ public: false, ownerId: 'other-owner' })
      await expect(service.addBotToServer('server-1', 'actor-1', 'bot'))
        .rejects.toThrow(ForbiddenException)
    })

    it('rejects if user is not a bot', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isBot: false })
      await expect(service.addBotToServer('server-1', 'actor-1', 'notabot'))
        .rejects.toThrow(NotFoundException)
    })

    it('rejects if already a member', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'bot-1', isBot: true })
      prisma.botApplication.findUnique.mockResolvedValue({ public: true, ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({ userId: 'bot-1', serverId: 'server-1' })
      await expect(service.addBotToServer('server-1', 'actor-1', 'bot'))
        .rejects.toThrow(ConflictException)
    })
  })

  describe('listServerBots', () => {
    it('rejects non-member requester', async () => {
      prisma.serverMember.findUnique.mockResolvedValue(null)
      await expect(service.listServerBots('server-1', 'outsider'))
        .rejects.toThrow(ForbiddenException)
    })
  })

  describe('getServerBotCommands', () => {
    it('rejects non-member requester', async () => {
      prisma.serverMember.findUnique.mockResolvedValue(null)
      await expect(service.getServerBotCommands('server-1', undefined, 'outsider'))
        .rejects.toThrow(ForbiddenException)
    })
  })

  describe('syncCommands', () => {
    it('replaces all commands for the bot', async () => {
      prisma.botApplication.findUnique.mockResolvedValue({ id: 'app-1', userId: 'bot-1' })
      prisma.serverMember.findMany.mockResolvedValue([{ serverId: 's1' }])
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const txPrisma = createMockPrismaService()
        txPrisma.botCommand.deleteMany.mockResolvedValue({})
        txPrisma.botCommand.createMany.mockResolvedValue({})
        return fn(txPrisma)
      })

      await service.syncCommands('app-1', [
        { name: 'setup', description: 'Setup the bot' },
        { name: 'help', description: 'Show help' }
      ])
      expect(events.emit).toHaveBeenCalledWith('bot:commands-updated', { serverId: 's1', botAppId: 'app-1' })
    })

    it('stores requiredPermission', async () => {
      prisma.botApplication.findUnique.mockResolvedValue({ id: 'app-1', userId: 'bot-1' })
      prisma.serverMember.findMany.mockResolvedValue([])
      let capturedData: any
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const txPrisma = createMockPrismaService()
        txPrisma.botCommand.deleteMany.mockResolvedValue({})
        txPrisma.botCommand.createMany.mockImplementation(async (args: any) => {
          capturedData = args.data
          return {}
        })
        return fn(txPrisma)
      })

      await service.syncCommands('app-1', [
        { name: 'setup', description: 'Setup', requiredPermission: 'MANAGE_CHANNELS' }
      ])
      expect(capturedData[0].requiredPermission).toBe('MANAGE_CHANNELS')
    })

    it('stores null when requiredPermission is not provided', async () => {
      prisma.botApplication.findUnique.mockResolvedValue({ id: 'app-1', userId: 'bot-1' })
      prisma.serverMember.findMany.mockResolvedValue([])
      let capturedData: any
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const txPrisma = createMockPrismaService()
        txPrisma.botCommand.deleteMany.mockResolvedValue({})
        txPrisma.botCommand.createMany.mockImplementation(async (args: any) => {
          capturedData = args.data
          return {}
        })
        return fn(txPrisma)
      })

      await service.syncCommands('app-1', [
        { name: 'help', description: 'Help' }
      ])
      expect(capturedData[0].requiredPermission).toBeNull()
    })
  })

  describe('regenerateToken', () => {
    it('generates a new token', async () => {
      prisma.botApplication.findUnique.mockResolvedValue({
        id: 'app-1', ownerId: 'owner-1', userId: 'bot-1',
        user: { id: 'bot-1', username: 'b', displayName: 'B', avatarUrl: null }
      })
      prisma.botApplication.update.mockResolvedValue({})
      const result = await service.regenerateToken('app-1', 'owner-1')
      expect(result.token).toMatch(/^bot_/)
    })
  })
})
