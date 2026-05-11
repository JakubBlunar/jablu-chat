import { Test, TestingModule } from '@nestjs/testing'
import { ChatGateway } from './gateway.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'
import { MessagesService } from '../messages/messages.service'
import { PollsService } from '../messages/polls.service'
import { AutoModService } from '../automod/automod.service'
import { DmService } from '../dm/dm.service'
import { LinkPreviewService } from '../messages/link-preview.service'
import { WsJwtGuard } from './ws-jwt.guard'
import { EventBusService } from '../events/event-bus.service'
import { ReadStateService } from '../read-state/read-state.service'
import { PushService } from '../push/push.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

// Silence gateway init side-effects (WebSocket setup, intervals)
jest.mock('./gateway-event-listeners', () => ({ registerEventListeners: jest.fn() }))

function makeDeps(prisma: MockPrismaService, redis: MockRedisService) {
  const events = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  }
  return {
    events,
    messages: {} as any,
    polls: {} as any,
    automod: {} as any,
    dm: {} as any,
    linkPreviews: {} as any,
    wsJwtGuard: {} as any,
    readState: {} as any,
    push: {} as any,
    roles: { getAllChannelPermissions: jest.fn() } as any,
    prisma,
    redis,
    events_obj: events,
  }
}

describe('ChatGateway', () => {
  let gateway: ChatGateway
  let prisma: MockPrismaService
  let redis: MockRedisService

  beforeEach(async () => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()

    const deps = makeDeps(prisma, redis)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: RolesService, useValue: deps.roles },
        { provide: MessagesService, useValue: deps.messages },
        { provide: PollsService, useValue: deps.polls },
        { provide: AutoModService, useValue: deps.automod },
        { provide: DmService, useValue: deps.dm },
        { provide: LinkPreviewService, useValue: deps.linkPreviews },
        { provide: WsJwtGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: EventBusService, useValue: deps.events_obj },
        { provide: ReadStateService, useValue: deps.readState },
        { provide: PushService, useValue: deps.push },
      ],
    })
      .overrideGuard(WsJwtGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile()

    gateway = module.get(ChatGateway)
  })

  // ── getFriendUserIds Redis cache ─────────────────────────────────────────────

  describe('getFriendUserIds', () => {
    const userId = 'u1'
    const friendIds = ['u2', 'u3']

    it('fetches from DB and caches on cache miss', async () => {
      redis.client.get.mockResolvedValue(null)
      prisma.friendship.findMany.mockResolvedValue([
        { requesterId: userId, addresseeId: 'u2' },
        { requesterId: 'u3', addresseeId: userId },
      ])

      const result = await gateway.getFriendUserIds(userId)

      expect(result).toEqual(['u2', 'u3'])
      expect(prisma.friendship.findMany).toHaveBeenCalledTimes(1)
      expect(redis.client.setex).toHaveBeenCalledWith(
        `friends:${userId}`,
        60,
        JSON.stringify(['u2', 'u3']),
      )
    })

    it('returns cached value without querying DB', async () => {
      redis.client.get.mockResolvedValue(JSON.stringify(friendIds))

      const result = await gateway.getFriendUserIds(userId)

      expect(result).toEqual(friendIds)
      expect(prisma.friendship.findMany).not.toHaveBeenCalled()
    })

    it('second call uses cache, not DB', async () => {
      // First call: miss
      redis.client.get.mockResolvedValueOnce(null)
      prisma.friendship.findMany.mockResolvedValue([
        { requesterId: userId, addresseeId: 'u2' },
      ])
      // Subsequent: simulate cache populated (setex was called)
      redis.client.get.mockResolvedValue(JSON.stringify(['u2']))

      await gateway.getFriendUserIds(userId)
      await gateway.getFriendUserIds(userId)

      expect(prisma.friendship.findMany).toHaveBeenCalledTimes(1)
    })
  })

  // ── invalidateFriendCache ─────────────────────────────────────────────────────

  describe('invalidateFriendCache', () => {
    it('deletes cache entries for both users', () => {
      gateway.invalidateFriendCache('u1', 'u2')
      expect(redis.client.del).toHaveBeenCalledWith('friends:u1', 'friends:u2')
    })
  })

  // ── checkAfkParticipants channel pre-load ─────────────────────────────────────

  describe('checkAfkParticipants (via internal state)', () => {
    it('queries channel table once for all voice channels (N+1 regression)', async () => {
      // Simulate 3 voice channels with 1 participant each
      const channels = ['ch-1', 'ch-2', 'ch-3']
      for (const chId of channels) {
        const participantMap = new Map([['socket-a', { userId: 'u1', username: 'alice' }]])
        // @ts-ignore access private map
        gateway['voiceParticipants'].set(chId, participantMap)
        // @ts-ignore
        gateway['voiceActivity'].set('socket-a', Date.now() - 9999999) // very idle
      }

      prisma.channel.findMany.mockResolvedValue([
        { id: 'ch-1', serverId: 's1' },
        { id: 'ch-2', serverId: 's1' },
        { id: 'ch-3', serverId: 's1' },
      ])
      prisma.server.findUnique.mockResolvedValue({ afkChannelId: null, afkTimeout: 300 })

      // @ts-ignore call private method
      await gateway['checkAfkParticipants']()

      // channel lookup must be ONE findMany, not N findUnique calls
      expect(prisma.channel.findMany).toHaveBeenCalledTimes(1)
      expect(prisma.channel.findUnique).not.toHaveBeenCalled()
    })
  })
})
