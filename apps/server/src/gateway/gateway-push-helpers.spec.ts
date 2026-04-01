import { describePushPreview, sendPushToOfflineMembers, sendPushToThreadParticipants, type PushContext } from './gateway-push-helpers'
import { Permission } from '@chat/shared'

describe('describePushPreview', () => {
  it('returns trimmed content when available', () => {
    expect(describePushPreview('Hello world')).toBe('Hello world')
  })

  it('truncates content to 100 chars', () => {
    const long = 'x'.repeat(200)
    expect(describePushPreview(long)).toHaveLength(100)
  })

  it('returns "[attachment]" when no content and no attachments', () => {
    expect(describePushPreview(undefined)).toBe('[attachment]')
    expect(describePushPreview('')).toBe('[attachment]')
  })

  it('describes a single image', () => {
    expect(describePushPreview(undefined, [{ type: 'image' }])).toBe('sent an image')
  })

  it('describes a single video', () => {
    expect(describePushPreview(undefined, [{ type: 'video' }])).toBe('sent a video')
  })

  it('describes a single GIF', () => {
    expect(describePushPreview(undefined, [{ type: 'gif' }])).toBe('sent a GIF')
  })

  it('describes a single file', () => {
    expect(describePushPreview(undefined, [{ type: 'other' }])).toBe('sent a file')
  })

  it('describes multiple files', () => {
    expect(describePushPreview(undefined, [{ type: 'image' }, { type: 'file' }])).toBe('sent 2 files')
  })

  it('prefers content over attachments', () => {
    expect(describePushPreview('Hello', [{ type: 'image' }])).toBe('Hello')
  })
})

function createMockContext(overrides: Partial<PushContext> = {}): PushContext {
  return {
    prisma: {
      serverMember: { findMany: jest.fn().mockResolvedValue([]) },
      channelNotifPref: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    } as any,
    push: { sendToUsers: jest.fn().mockResolvedValue(undefined) } as any,
    redis: {
      client: {
        hgetall: jest.fn().mockResolvedValue({}),
        hmset: jest.fn().mockResolvedValue('OK'),
        expire: jest.fn().mockResolvedValue(1),
      },
    } as any,
    roles: {
      getChannelPermissions: jest.fn().mockResolvedValue(Permission.VIEW_CHANNEL),
    } as any,
    isUserOnline: jest.fn().mockReturnValue(false),
    ...overrides,
  }
}

describe('sendPushToOfflineMembers', () => {
  it('sends push to offline members with default "all" pref', async () => {
    const ctx = createMockContext()
    ;(ctx.prisma.serverMember.findMany as jest.Mock).mockResolvedValue([
      { userId: 'u-offline', notifLevel: null },
    ])

    await sendPushToOfflineMembers(ctx, 's1', 'sender', 'Alice', 'hello', '/url', 'ch-1', [])

    expect(ctx.push.sendToUsers).toHaveBeenCalledWith(
      ['u-offline'],
      expect.objectContaining({ title: 'Alice', body: 'hello' }),
    )
  })

  it('skips online members', async () => {
    const ctx = createMockContext({ isUserOnline: jest.fn().mockReturnValue(true) })
    ;(ctx.prisma.serverMember.findMany as jest.Mock).mockResolvedValue([
      { userId: 'u-online', notifLevel: null },
    ])

    await sendPushToOfflineMembers(ctx, 's1', 'sender', 'Alice', 'hello', '/url', 'ch-1', [])

    expect(ctx.push.sendToUsers).not.toHaveBeenCalled()
  })

  it('skips members with "none" pref', async () => {
    const ctx = createMockContext()
    ;(ctx.prisma.serverMember.findMany as jest.Mock).mockResolvedValue([
      { userId: 'u-1', notifLevel: 'none' },
    ])

    await sendPushToOfflineMembers(ctx, 's1', 'sender', 'Alice', 'hello', '/url', 'ch-1', [])

    expect(ctx.push.sendToUsers).not.toHaveBeenCalled()
  })

  it('only pushes to mentioned users when pref is "mentions"', async () => {
    const ctx = createMockContext()
    ;(ctx.prisma.serverMember.findMany as jest.Mock).mockResolvedValue([
      { userId: 'u-mentioned', notifLevel: 'mentions' },
      { userId: 'u-not-mentioned', notifLevel: 'mentions' },
    ])

    await sendPushToOfflineMembers(ctx, 's1', 'sender', 'Alice', 'hello', '/url', 'ch-1', ['u-mentioned'])

    expect(ctx.push.sendToUsers).toHaveBeenCalledWith(
      ['u-mentioned'],
      expect.anything(),
    )
  })

  it('skips members without VIEW_CHANNEL permission', async () => {
    const ctx = createMockContext()
    ;(ctx.prisma.serverMember.findMany as jest.Mock).mockResolvedValue([
      { userId: 'u-noperm', notifLevel: null },
    ])
    ;(ctx.roles.getChannelPermissions as jest.Mock).mockResolvedValue(0n)

    await sendPushToOfflineMembers(ctx, 's1', 'sender', 'Alice', 'hello', '/url', 'ch-1', [])

    expect(ctx.push.sendToUsers).not.toHaveBeenCalled()
  })
})

describe('sendPushToThreadParticipants', () => {
  it('sends to offline thread participants', async () => {
    const ctx = createMockContext()
    ;(ctx.prisma.message.findUnique as jest.Mock).mockResolvedValue({ authorId: 'u-parent' })
    ;(ctx.prisma.message.findMany as jest.Mock).mockResolvedValue([{ authorId: 'u-replier' }])
    ;(ctx.prisma.serverMember.findMany as jest.Mock).mockResolvedValue([
      { userId: 'u-parent', notifLevel: null },
      { userId: 'u-replier', notifLevel: null },
    ])

    await sendPushToThreadParticipants(ctx, 'parent-1', 'ch-1', 's1', 'sender', 'Alice', 'reply text')

    expect(ctx.push.sendToUsers).toHaveBeenCalledWith(
      expect.arrayContaining(['u-parent', 'u-replier']),
      expect.objectContaining({ title: 'Alice replied in a thread' }),
    )
  })

  it('excludes the sender from recipients', async () => {
    const ctx = createMockContext()
    ;(ctx.prisma.message.findUnique as jest.Mock).mockResolvedValue({ authorId: 'sender' })
    ;(ctx.prisma.message.findMany as jest.Mock).mockResolvedValue([])

    await sendPushToThreadParticipants(ctx, 'parent-1', 'ch-1', 's1', 'sender', 'Alice', 'hi')

    expect(ctx.push.sendToUsers).not.toHaveBeenCalled()
  })
})
