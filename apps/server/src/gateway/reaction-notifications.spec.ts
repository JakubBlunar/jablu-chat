import { Permission } from '@chat/shared'
import { deliverReactionNotifications } from './reaction-notifications'

function setup() {
  const message = {
    id: 'message', authorId: 'author', author: { isBot: false }, content: 'Hello', attachments: [],
    channel: { id: 'channel', serverId: 'server', name: 'general' },
    directConversationId: null as string | null, threadParentId: null as string | null
  }
  const emit = jest.fn()
  const ctx = {
    prisma: {
      message: { findMany: jest.fn().mockResolvedValue([message]) },
      user: { findUnique: jest.fn().mockResolvedValue({ username: 'friend', displayName: 'Friend' }) },
      serverMember: { findUnique: jest.fn().mockResolvedValue({ notifLevel: 'all' }) },
      channelNotifPref: { findUnique: jest.fn().mockResolvedValue(null) },
      directConversationMember: { findUnique: jest.fn().mockResolvedValue({ muted: false }) }
    },
    roles: { getChannelPermissions: jest.fn().mockResolvedValue(Permission.VIEW_CHANNEL) },
    notifications: { dispatch: jest.fn().mockResolvedValue(undefined) },
    server: { to: jest.fn().mockReturnValue({ emit }) }
  }
  const deliver = (ids = ['message'], custom = false) => deliverReactionNotifications(
    ctx as unknown as Parameters<typeof deliverReactionNotifications>[0], ids, 'actor', custom ? 'party' : '🎉', custom
  )
  return { ctx, message, emit, deliver }
}

it('records a personal alert, sends push and a live user event, and jumps into threads', async () => {
  const { ctx, message, emit, deliver } = setup()
  message.threadParentId = 'parent'
  await deliver()
  expect(ctx.prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: { in: ['message'] }, deleted: false, authorId: { not: 'actor' } }
  }))
  expect(ctx.notifications.dispatch).toHaveBeenCalledWith(expect.objectContaining({
    userIds: ['author'], kind: 'reaction', push: true,
    dedupeKey: 'reaction:message:actor:🎉',
    url: '/channels/server/channel?m=message&thread=parent',
    payload: expect.objectContaining({ authorName: 'Friend', snippet: 'Hello', emoji: '🎉', threadParentId: 'parent' })
  }))
  expect(ctx.server.to).toHaveBeenCalledWith('user:author')
  expect(emit).toHaveBeenCalledWith('notification:reaction', expect.objectContaining({ emoji: '🎉' }))
})

it('coalesces grouped additions per author and skips no-op retries', async () => {
  const { ctx, message, deliver } = setup()
  ctx.prisma.message.findMany.mockResolvedValue([message, { ...message, id: 'older' }])
  await deliver(['message', 'older'])
  expect(ctx.notifications.dispatch).toHaveBeenCalledTimes(1)
  ctx.notifications.dispatch.mockClear()
  ctx.prisma.message.findMany.mockClear()
  await deliver([])
  expect(ctx.notifications.dispatch).not.toHaveBeenCalled()
  expect(ctx.prisma.message.findMany).not.toHaveBeenCalled()
})

it.each(['muted', 'left', 'private', 'bot'])('does not notify an ineligible author: %s', async (reason) => {
  const { ctx, message, deliver, emit } = setup()
  if (reason === 'muted') ctx.prisma.serverMember.findUnique.mockResolvedValue({ notifLevel: 'none' })
  if (reason === 'left') ctx.prisma.serverMember.findUnique.mockResolvedValue(null)
  if (reason === 'private') ctx.roles.getChannelPermissions.mockResolvedValue(0n)
  if (reason === 'bot') message.author.isBot = true
  await deliver()
  expect(ctx.notifications.dispatch).not.toHaveBeenCalled()
  expect(emit).not.toHaveBeenCalled()
})

it('treats reactions as personal activity in mentions-only channels and honors overrides', async () => {
  const { ctx, deliver } = setup()
  ctx.prisma.serverMember.findUnique.mockResolvedValue({ notifLevel: 'none' })
  ctx.prisma.channelNotifPref.findUnique.mockResolvedValue({ level: 'mentions' })
  await deliver()
  expect(ctx.notifications.dispatch).toHaveBeenCalledTimes(1)
  ctx.notifications.dispatch.mockClear()
  ctx.prisma.channelNotifPref.findUnique.mockResolvedValue({ level: 'none' })
  await deliver()
  expect(ctx.notifications.dispatch).not.toHaveBeenCalled()
})

it('delivers custom reactions in DMs and honors DM mute and membership', async () => {
  const { ctx, message, deliver } = setup()
  Object.assign(message, { channel: null, directConversationId: 'dm' })
  await deliver(['message'], true)
  expect(ctx.notifications.dispatch).toHaveBeenCalledWith(expect.objectContaining({
    url: '/channels/@me/dm?m=message', title: 'Friend reacted :party: to your message',
    payload: expect.objectContaining({ conversationId: 'dm', isCustom: true })
  }))
  for (const member of [{ muted: true }, null]) {
    ctx.notifications.dispatch.mockClear()
    ctx.prisma.directConversationMember.findUnique.mockResolvedValue(member)
    await deliver()
    expect(ctx.notifications.dispatch).not.toHaveBeenCalled()
  }
})
