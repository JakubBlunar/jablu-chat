import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'
import {
  describePushPreview,
  getChannelNotifPrefs,
  sendPushToOfflineMembers
} from './gateway-push.service'

describe('describePushPreview', () => {
  it('returns trimmed content up to 100 chars', () => {
    expect(describePushPreview('Hello world')).toBe('Hello world')
  })

  it('truncates long content at 100 chars', () => {
    const long = 'a'.repeat(200)
    expect(describePushPreview(long)).toHaveLength(100)
  })

  it('returns "[attachment]" for empty content and no attachments', () => {
    expect(describePushPreview(undefined)).toBe('[attachment]')
    expect(describePushPreview('')).toBe('[attachment]')
    expect(describePushPreview('   ')).toBe('[attachment]')
  })

  it('returns "[attachment]" for empty content with empty attachment list', () => {
    expect(describePushPreview(undefined, [])).toBe('[attachment]')
  })

  it('describes a single image attachment', () => {
    expect(describePushPreview(undefined, [{ type: 'image' }])).toBe('sent an image')
  })

  it('describes a single video attachment', () => {
    expect(describePushPreview(undefined, [{ type: 'video' }])).toBe('sent a video')
  })

  it('describes a single GIF attachment', () => {
    expect(describePushPreview(undefined, [{ type: 'gif' }])).toBe('sent a GIF')
  })

  it('describes a single file attachment', () => {
    expect(describePushPreview(undefined, [{ type: 'file' }])).toBe('sent a file')
  })

  it('describes multiple attachments with count', () => {
    expect(describePushPreview(undefined, [{ type: 'image' }, { type: 'video' }])).toBe('sent 2 files')
  })

  it('prefers content over attachments when both present', () => {
    expect(describePushPreview('Check this out', [{ type: 'image' }])).toBe('Check this out')
  })
})

describe('getChannelNotifPrefs', () => {
  let prisma: MockPrismaService
  let redis: MockRedisService

  beforeEach(() => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
  })

  it('returns prefs from Redis cache when available', async () => {
    redis.client.hgetall.mockResolvedValue({ u1: 'none', u2: 'mentions' })

    const result = await getChannelNotifPrefs(prisma as any, redis as any, 'ch1', ['u1', 'u3'])

    expect(result.get('u1')).toBe('none')
    expect(result.has('u3')).toBe(false)
    expect(prisma.channelNotifPref.findMany).not.toHaveBeenCalled()
  })

  it('falls back to DB when cache is empty', async () => {
    redis.client.hgetall.mockResolvedValue({})
    prisma.channelNotifPref.findMany.mockResolvedValue([
      { userId: 'u1', channelId: 'ch1', level: 'mentions' },
      { userId: 'u2', channelId: 'ch1', level: 'none' }
    ])
    redis.client.hmset.mockResolvedValue('OK')
    redis.client.expire.mockResolvedValue(1)

    const result = await getChannelNotifPrefs(prisma as any, redis as any, 'ch1', ['u1'])

    expect(result.get('u1')).toBe('mentions')
    expect(redis.client.hmset).toHaveBeenCalledWith('notifprefs:ch1', { u1: 'mentions', u2: 'none' })
    expect(redis.client.expire).toHaveBeenCalledWith('notifprefs:ch1', 300)
  })

  it('returns empty map when DB has no prefs', async () => {
    redis.client.hgetall.mockResolvedValue({})
    prisma.channelNotifPref.findMany.mockResolvedValue([])

    const result = await getChannelNotifPrefs(prisma as any, redis as any, 'ch1', ['u1'])

    expect(result.size).toBe(0)
    expect(redis.client.hmset).not.toHaveBeenCalled()
  })

  it('falls through to DB when Redis throws', async () => {
    redis.client.hgetall.mockRejectedValue(new Error('conn lost'))
    prisma.channelNotifPref.findMany.mockResolvedValue([
      { userId: 'u1', channelId: 'ch1', level: 'all' }
    ])
    redis.client.hmset.mockResolvedValue('OK')
    redis.client.expire.mockResolvedValue(1)

    const result = await getChannelNotifPrefs(prisma as any, redis as any, 'ch1', ['u1'])

    expect(result.get('u1')).toBe('all')
  })

  it('tolerates Redis cache-write failure', async () => {
    redis.client.hgetall.mockResolvedValue({})
    prisma.channelNotifPref.findMany.mockResolvedValue([
      { userId: 'u1', channelId: 'ch1', level: 'mentions' }
    ])
    redis.client.hmset.mockRejectedValue(new Error('write fail'))

    const result = await getChannelNotifPrefs(prisma as any, redis as any, 'ch1', ['u1'])

    expect(result.get('u1')).toBe('mentions')
  })
})

describe('sendPushToOfflineMembers', () => {
  let prisma: MockPrismaService
  let redis: MockRedisService
  let push: { sendToUsers: jest.Mock }
  let isUserOnline: jest.Mock

  beforeEach(() => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    push = { sendToUsers: jest.fn().mockResolvedValue(undefined) }
    isUserOnline = jest.fn().mockReturnValue(false)
    redis.client.hgetall.mockResolvedValue({})
    prisma.channelNotifPref.findMany.mockResolvedValue([])
  })

  it('sends push to all offline members by default', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: null },
      { userId: 'u2', notifLevel: null }
    ])

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hello', '/url', 'ch1', []
    )

    expect(push.sendToUsers).toHaveBeenCalledWith(['u1', 'u2'], {
      title: 'Alice',
      body: 'Hello',
      url: '/url'
    })
  })

  it('skips online members', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: null },
      { userId: 'u2', notifLevel: null }
    ])
    isUserOnline.mockImplementation((id: string) => id === 'u1')

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hello', '/url', 'ch1', []
    )

    expect(push.sendToUsers).toHaveBeenCalledWith(['u2'], expect.any(Object))
  })

  it('does not send when all members are online', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: null }
    ])
    isUserOnline.mockReturnValue(true)

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hello', '/url', 'ch1', []
    )

    expect(push.sendToUsers).not.toHaveBeenCalled()
  })

  it('skips users with effective pref "none"', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: 'none' },
      { userId: 'u2', notifLevel: null }
    ])

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hello', '/url', 'ch1', []
    )

    expect(push.sendToUsers).toHaveBeenCalledWith(['u2'], expect.any(Object))
  })

  it('respects channel-level pref over server-level', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: 'all' }
    ])
    redis.client.hgetall.mockResolvedValue({ u1: 'none' })

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hello', '/url', 'ch1', []
    )

    expect(push.sendToUsers).not.toHaveBeenCalled()
  })

  it('sends only to mentioned users when pref is "mentions"', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: 'mentions' },
      { userId: 'u2', notifLevel: 'mentions' }
    ])

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hey', '/url', 'ch1', ['u2']
    )

    expect(push.sendToUsers).toHaveBeenCalledWith(['u2'], expect.any(Object))
  })

  it('filters by VIEW_CHANNEL permission when roles service provided', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: null },
      { userId: 'u2', notifLevel: null }
    ])
    const VIEW_CHANNEL = 1n << 12n
    const roles = {
      getChannelPermissions: jest.fn()
        .mockResolvedValueOnce(0n)
        .mockResolvedValueOnce(VIEW_CHANNEL)
    }

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hello', '/url', 'ch1', [],
      undefined, roles as any
    )

    expect(push.sendToUsers).toHaveBeenCalledWith(['u2'], expect.any(Object))
  })

  it('skips member when roles.getChannelPermissions throws', async () => {
    prisma.serverMember.findMany.mockResolvedValue([
      { userId: 'u1', notifLevel: null }
    ])
    const roles = {
      getChannelPermissions: jest.fn().mockRejectedValue(new Error('removed'))
    }

    await sendPushToOfflineMembers(
      prisma as any, push as any, redis as any,
      isUserOnline, 's1', 'sender', 'Alice', 'Hello', '/url', 'ch1', [],
      undefined, roles as any
    )

    expect(push.sendToUsers).not.toHaveBeenCalled()
  })
})
