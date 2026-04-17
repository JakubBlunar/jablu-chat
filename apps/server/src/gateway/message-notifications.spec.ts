import { Permission } from '@chat/shared'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'
import {
  deliverChannelMessage,
  deliverDmMessage,
  type MessageNotificationsContext
} from './message-notifications'

const VIEW_AND_SEND = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES

function makeCtx(prisma: MockPrismaService, redis: MockRedisService) {
  const inApp = {
    recordMentions: jest.fn().mockResolvedValue(undefined),
    recordChannelMessage: jest.fn().mockResolvedValue(undefined),
    recordThreadActivity: jest.fn().mockResolvedValue(undefined),
    recordDmMessages: jest.fn().mockResolvedValue(undefined),
    resolveThreadParticipantUserIds: jest.fn().mockResolvedValue([])
  }
  const readState = {
    resolveMentions: jest.fn().mockResolvedValue({ userIds: [], everyone: false, here: false }),
    incrementMention: jest.fn().mockResolvedValue(undefined),
    incrementDmMention: jest.fn().mockResolvedValue(undefined)
  }
  const push = {
    sendToUsers: jest.fn().mockResolvedValue(undefined)
  }
  const roles = {
    getChannelPermissions: jest.fn().mockResolvedValue(VIEW_AND_SEND)
  }
  const linkPreviews = {
    generatePreviews: jest.fn().mockResolvedValue([])
  }
  const emitToChannel = jest.fn()
  const emitToDm = jest.fn()
  const hasActiveSocket = jest.fn().mockReturnValue(false)
  const getOnlineUserIds = jest.fn().mockReturnValue([])

  const ctx: MessageNotificationsContext = {
    prisma: prisma as any,
    push: push as any,
    redis: redis as any,
    roles: roles as any,
    inApp: inApp as any,
    readState: readState as any,
    linkPreviews: linkPreviews as any,
    hasActiveSocket,
    getOnlineUserIds,
    emitToChannel,
    emitToDm
  }

  return { ctx, inApp, readState, push, roles, linkPreviews, emitToChannel, emitToDm, hasActiveSocket }
}

async function flush() {
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
}

describe('deliverChannelMessage', () => {
  let prisma: MockPrismaService
  let redis: MockRedisService

  beforeEach(() => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    redis.client.hgetall.mockResolvedValue({})
    prisma.channel.findUnique.mockResolvedValue({ name: 'general', serverId: 'srv-1' })
    prisma.serverMember.findMany.mockImplementation(async (args: any) => {
      const all = [
        { userId: 'sender', notifLevel: 'all' },
        { userId: 'r1', notifLevel: 'all' },
        { userId: 'r2', notifLevel: 'all' }
      ]
      const excludeId = args?.where?.NOT?.userId
      const inSet = args?.where?.userId?.in as string[] | undefined
      let rows = all
      if (excludeId) rows = rows.filter((m) => m.userId !== excludeId)
      if (inSet) rows = rows.filter((m) => inSet.includes(m.userId))
      return rows
    })
    prisma.channelNotifPref.findMany.mockResolvedValue([])
    prisma.message.findUnique.mockResolvedValue(null)
    prisma.message.findMany.mockResolvedValue([])
  })

  it('emits message:new with mention fields and routes through unified pipeline (REST/bot path)', async () => {
    const { ctx, inApp, readState, push, emitToChannel } = makeCtx(prisma, redis)
    readState.resolveMentions.mockResolvedValue({ userIds: ['r1'], everyone: false, here: false })

    await deliverChannelMessage(ctx, {
      serverId: 'srv-1',
      channelId: 'ch-1',
      channelName: 'general',
      message: {
        id: 'm-1',
        content: 'hello @bob',
        author: { id: 'sender', username: 'alice', displayName: 'Alice' },
        attachments: []
      },
      senderId: 'sender'
    })
    await flush()

    expect(emitToChannel).toHaveBeenCalledWith(
      'ch-1',
      'message:new',
      expect.objectContaining({
        id: 'm-1',
        serverId: 'srv-1',
        mentionedUserIds: ['r1'],
        mentionEveryone: false,
        mentionHere: false
      })
    )
    expect(readState.incrementMention).toHaveBeenCalledWith('ch-1', ['r1'])
    expect(inApp.recordMentions).toHaveBeenCalledWith(
      ['r1'],
      expect.objectContaining({ messageId: 'm-1', channelName: 'general' })
    )
    expect(inApp.recordChannelMessage).toHaveBeenCalled()
    expect(push.sendToUsers).toHaveBeenCalled()
  })

  it('records coalesced channel_message rows for non-mentioned recipients with VIEW_CHANNEL', async () => {
    const { ctx, inApp } = makeCtx(prisma, redis)

    await deliverChannelMessage(ctx, {
      serverId: 'srv-1',
      channelId: 'ch-1',
      message: {
        id: 'm-1',
        content: 'hi everyone',
        author: { id: 'sender', username: 'alice' }
      },
      senderId: 'sender'
    })
    await flush()

    expect(inApp.recordChannelMessage).toHaveBeenCalledWith(
      ['r1', 'r2'],
      expect.objectContaining({
        serverId: 'srv-1',
        channelId: 'ch-1',
        messageId: 'm-1'
      })
    )
  })

  it('skips push for users with an active socket', async () => {
    const { ctx, push, hasActiveSocket } = makeCtx(prisma, redis)
    hasActiveSocket.mockImplementation((uid: string) => uid === 'r1')

    await deliverChannelMessage(ctx, {
      serverId: 'srv-1',
      channelId: 'ch-1',
      message: {
        id: 'm-1',
        content: 'hi',
        author: { id: 'sender', username: 'alice' }
      },
      senderId: 'sender'
    })
    await flush()

    expect(push.sendToUsers).toHaveBeenCalledTimes(1)
    const [recipients] = push.sendToUsers.mock.calls[0]
    expect(recipients).toEqual(['r2'])
  })

  it('skips push and in-app entirely for welcome messages', async () => {
    const { ctx, inApp, push, emitToChannel } = makeCtx(prisma, redis)

    await deliverChannelMessage(ctx, {
      serverId: 'srv-1',
      channelId: 'welcome',
      channelName: 'welcome',
      message: {
        id: 'welcome-1',
        content: 'Welcome!',
        author: null
      },
      senderId: null,
      senderDisplayName: 'My Server',
      skipPush: true,
      skipInApp: true,
      skipLinkPreviews: true
    })
    await flush()

    expect(emitToChannel).toHaveBeenCalledWith(
      'welcome',
      'message:new',
      expect.objectContaining({ id: 'welcome-1', serverId: 'srv-1' })
    )
    expect(inApp.recordMentions).not.toHaveBeenCalled()
    expect(inApp.recordChannelMessage).not.toHaveBeenCalled()
    expect(push.sendToUsers).not.toHaveBeenCalled()
  })

  it('routes thread replies through sendPushToThreadParticipants (not channel push)', async () => {
    const { ctx, inApp, push } = makeCtx(prisma, redis)
    prisma.message.findUnique.mockResolvedValue({ authorId: 'parent-author' })
    prisma.message.findMany.mockResolvedValue([{ authorId: 'replier' }])
    prisma.serverMember.findMany.mockImplementation(async (args: any) => {
      const all = [
        { userId: 'parent-author', notifLevel: 'all' },
        { userId: 'replier', notifLevel: 'all' }
      ]
      const inSet = args?.where?.userId?.in as string[] | undefined
      return inSet ? all.filter((m) => inSet.includes(m.userId)) : all
    })
    inApp.resolveThreadParticipantUserIds.mockResolvedValue(['parent-author', 'replier'])

    await deliverChannelMessage(ctx, {
      serverId: 'srv-1',
      channelId: 'ch-1',
      message: {
        id: 'reply-1',
        content: 'thread reply',
        author: { id: 'sender', username: 'alice' },
        threadParentId: 'parent-1'
      },
      senderId: 'sender',
      threadUpdate: { parentId: 'parent-1', threadCount: 2 }
    })
    await flush()

    expect(inApp.recordThreadActivity).toHaveBeenCalled()
    expect(inApp.recordChannelMessage).not.toHaveBeenCalled()
    expect(push.sendToUsers).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ title: expect.stringContaining('replied in a thread') })
    )
  })

  it('uses senderDisplayName for synthetic webhook senders', async () => {
    const { ctx, push } = makeCtx(prisma, redis)

    await deliverChannelMessage(ctx, {
      serverId: 'srv-1',
      channelId: 'ch-1',
      message: {
        id: 'wh-1',
        content: 'webhook says hi',
        author: null
      },
      senderId: null,
      senderDisplayName: 'GitHub'
    })
    await flush()

    expect(push.sendToUsers).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ title: 'GitHub' })
    )
  })
})

describe('deliverDmMessage', () => {
  let prisma: MockPrismaService
  let redis: MockRedisService

  beforeEach(() => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    prisma.directConversationMember.findMany.mockResolvedValue([
      { userId: 'sender' },
      { userId: 'other' }
    ])
  })

  it('emits dm:new, increments DM mention, records DM in-app, and pushes to offline members', async () => {
    const { ctx, readState, inApp, push, emitToDm } = makeCtx(prisma, redis)

    await deliverDmMessage(ctx, {
      conversationId: 'conv-1',
      message: {
        id: 'dm-1',
        content: 'hi',
        author: { id: 'sender', username: 'alice' }
      },
      senderId: 'sender'
    })
    await flush()

    expect(emitToDm).toHaveBeenCalledWith(
      'conv-1',
      'dm:new',
      expect.objectContaining({ id: 'dm-1', conversationId: 'conv-1' })
    )
    expect(readState.incrementDmMention).toHaveBeenCalledWith('conv-1', ['other'])
    expect(inApp.recordDmMessages).toHaveBeenCalledWith(
      ['other'],
      expect.objectContaining({ conversationId: 'conv-1', messageId: 'dm-1' })
    )
    expect(push.sendToUsers).toHaveBeenCalledWith(['other'], expect.any(Object))
  })

  it('skips push for DM members with an active socket', async () => {
    const { ctx, push, hasActiveSocket } = makeCtx(prisma, redis)
    hasActiveSocket.mockReturnValue(true)

    await deliverDmMessage(ctx, {
      conversationId: 'conv-1',
      message: {
        id: 'dm-1',
        content: 'hi',
        author: { id: 'sender', username: 'alice' }
      },
      senderId: 'sender'
    })
    await flush()

    expect(push.sendToUsers).not.toHaveBeenCalled()
  })
})
