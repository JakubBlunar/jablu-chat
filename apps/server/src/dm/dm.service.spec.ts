import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DmService } from './dm.service'
import { PrismaService } from '../prisma/prisma.service'
import { FriendsService } from '../friends/friends.service'
import { MessagesService } from '../messages/messages.service'
import { EventBusService } from '../events/event-bus.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('DmService', () => {
  let service: DmService
  let prisma: MockPrismaService
  let friends: { areFriends: jest.Mock }

  const userA = 'user-a'
  const userB = 'user-b'
  const convId = 'conv-1'

  const makeDmMessage = (overrides: Record<string, unknown> = {}) => ({
    id: 'msg-1',
    directConversationId: convId,
    channelId: null,
    authorId: userA,
    content: 'Hello',
    deleted: false,
    pinned: false,
    editedAt: null,
    createdAt: new Date('2024-06-01'),
    threadParentId: null,
    replyToId: null,
    webhookId: null,
    webhookName: null,
    webhookAvatarUrl: null,
    author: { id: userA, username: 'alice', displayName: 'Alice', avatarUrl: null },
    attachments: [],
    reactions: [],
    replyTo: null,
    linkPreviews: [],
    ...overrides,
  })

  const makeConversation = (overrides: Record<string, unknown> = {}) => ({
    id: convId,
    isGroup: false,
    groupName: null,
    createdAt: new Date('2024-06-01'),
    members: [
      { userId: userA, user: { id: userA, username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null, status: 'online', createdAt: new Date('2024-01-01') } },
      { userId: userB, user: { id: userB, username: 'bob', displayName: 'Bob', avatarUrl: null, bio: null, status: 'online', createdAt: new Date('2024-01-01') } },
    ],
    ...overrides,
  })

  beforeEach(async () => {
    prisma = createMockPrismaService()
    friends = { areFriends: jest.fn().mockResolvedValue(true) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmService,
        { provide: PrismaService, useValue: prisma },
        { provide: FriendsService, useValue: friends },
        { provide: MessagesService, useValue: {} },
        { provide: EventBusService, useValue: { emit: jest.fn() } },
      ],
    }).compile()

    service = module.get(DmService)
  })

  describe('requireMembership', () => {
    it('returns member when found', async () => {
      prisma.directConversationMember.findUnique.mockResolvedValue({ conversationId: convId, userId: userA })
      const result = await service.requireMembership(convId, userA)
      expect(result.userId).toBe(userA)
    })

    describe('getAttachments', () => {
      it('checks membership before querying attachments', async () => {
        prisma.directConversationMember.findUnique.mockResolvedValue(null)
        await expect(service.getAttachments(convId, userA, 'media', 0, 30)).rejects.toThrow(ForbiddenException)
        expect(prisma.attachment.findMany).not.toHaveBeenCalled()
      })

      describe('group management', () => {
        beforeEach(() => {
          prisma.$transaction.mockImplementation((callback) => callback(prisma))
          prisma.directConversation.findUnique.mockResolvedValue(makeConversation({ isGroup: true }))
          prisma.user.findMany.mockResolvedValue([
            { id: userA, dmPrivacy: 'everyone' }, { id: userB, dmPrivacy: 'everyone' }, { id: 'user-c', dmPrivacy: 'everyone' }
          ])
        })

        it('allows any participant to rename a group while keeping preferences private', async () => {
          prisma.directConversation.update.mockResolvedValue(makeConversation({ isGroup: true, groupName: 'New name' }))
          const result = await service.updateGroup(convId, userB, { groupName: ' New name ' })
          expect(prisma.$queryRaw).toHaveBeenCalled()
          expect(prisma.directConversation.update).toHaveBeenCalledWith(expect.objectContaining({ data: { groupName: 'New name' } }))
          expect(result.groupName).toBe('New name')
          expect(result.members[0]).not.toHaveProperty('muted')
          expect(result.members[0]).not.toHaveProperty('isFavorite')
        })

        it('rejects nonmembers before changing a group', async () => {
          await expect(service.updateGroup(convId, 'outsider', { groupName: 'No' })).rejects.toThrow(ForbiddenException)
          expect(prisma.directConversation.update).not.toHaveBeenCalled()
        })

        it('rejects group actions in one-to-one DMs', async () => {
          prisma.directConversation.findUnique.mockResolvedValue(makeConversation())
          await expect(service.addGroupMembers(convId, userA, ['user-c'])).rejects.toThrow('only available in group DMs')
          expect(prisma.directConversationMember.createMany).not.toHaveBeenCalled()
        })

        it('adds only new members, preserving the shared history', async () => {
          prisma.directConversation.findUniqueOrThrow.mockResolvedValue(makeConversation({ isGroup: true }))
          await service.addGroupMembers(convId, userB, [userA, 'user-c', 'user-c'])
          expect(prisma.directConversationMember.createMany).toHaveBeenCalledWith({ data: [{ conversationId: convId, userId: 'user-c' }] })
          expect(prisma.message.updateMany).not.toHaveBeenCalled()
        })

        it('checks the 10-person limit after locking the group', async () => {
          const ids = Array.from({ length: 9 }, (_, i) => `new-${i}`)
          await expect(service.addGroupMembers(convId, userA, ids)).rejects.toThrow('limited to 10')
          expect(prisma.directConversationMember.createMany).not.toHaveBeenCalled()
        })

        it('honors friends-only privacy when adding members', async () => {
          prisma.user.findMany.mockResolvedValue([
            { id: userA, dmPrivacy: 'everyone' }, { id: userB, dmPrivacy: 'everyone' }, { id: 'user-c', dmPrivacy: 'friends_only' }
          ])
          prisma.friendship.findMany.mockResolvedValue([])
          await expect(service.addGroupMembers(convId, userA, ['user-c'])).rejects.toThrow('must be friends')
          expect(prisma.directConversationMember.createMany).not.toHaveBeenCalled()
        })

        it('removes membership and read state without deleting shared messages', async () => {
          await service.leaveGroup(convId, userB)
          expect(prisma.directConversationMember.delete).toHaveBeenCalledWith({ where: { conversationId_userId: { conversationId: convId, userId: userB } } })
          expect(prisma.dmReadState.deleteMany).toHaveBeenCalledWith({ where: { conversationId: convId, userId: userB } })
          expect(prisma.message.deleteMany).not.toHaveBeenCalled()
        })
      })

      it.each(['media', 'files'] as const)('paginates %s across non-deleted conversation messages', async (kind) => {
        prisma.directConversationMember.findUnique.mockResolvedValue({ userId: userA })
        prisma.$transaction.mockResolvedValue([[
          { id: 'att-1', messageId: 'old-message', message: { createdAt: new Date('2024-01-01'), author: { username: 'alice', displayName: 'Alice' } } }
        ], 65])
        const result = await service.getAttachments(convId, userA, kind, 1, 30)
        expect(prisma.attachment.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: {
            type: { in: kind === 'files' ? ['file'] : ['image', 'gif', 'video'] },
            message: { is: { directConversationId: convId, deleted: false } }
          },
          skip: 30,
          take: 30,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        }))
        expect(result).toEqual({ items: [{ id: 'att-1', messageId: 'old-message', createdAt: '2024-01-01T00:00:00.000Z', authorName: 'Alice' }], total: 65 })
      })
    })

    it('throws ForbiddenException when not a member', async () => {
      prisma.directConversationMember.findUnique.mockResolvedValue(null)
      await expect(service.requireMembership(convId, userA)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('findOrCreateDm', () => {
    it('throws on self-DM', async () => {
      await expect(service.findOrCreateDm(userA, userA)).rejects.toThrow('Cannot create a DM with yourself')
    })

    it('throws when recipient not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)
      await expect(service.findOrCreateDm(userA, userB)).rejects.toThrow(NotFoundException)
    })

    it('reuses existing 1:1 conversation and reopens if closed', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB, dmPrivacy: 'everyone' })
      prisma.directConversation.findFirst.mockResolvedValue(makeConversation())
      prisma.directConversationMember.updateMany.mockResolvedValue({ count: 1 })

      const result = await service.findOrCreateDm(userA, userB)
      expect(result.id).toBe(convId)
      expect(prisma.directConversationMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: convId, userId: userA, closedAt: { not: null } },
          data: { closedAt: null },
        }),
      )
    })

    it('throws when recipient has friends_only and not friends', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB, dmPrivacy: 'friends_only' })
      prisma.directConversation.findFirst.mockResolvedValue(null)
      friends.areFriends.mockResolvedValue(false)

      await expect(service.findOrCreateDm(userA, userB)).rejects.toThrow('This user only accepts DMs from friends')
    })

    it('creates a new DM when none exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB, dmPrivacy: 'everyone' })
      prisma.directConversation.findFirst.mockResolvedValue(null)
      prisma.directConversation.create.mockResolvedValue(makeConversation())

      const result = await service.findOrCreateDm(userA, userB)
      expect(result.id).toBe(convId)
      expect(prisma.directConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isGroup: false }),
        }),
      )
    })

    it('allows friends_only when they are friends', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB, dmPrivacy: 'friends_only' })
      prisma.directConversation.findFirst.mockResolvedValue(null)
      friends.areFriends.mockResolvedValue(true)
      prisma.directConversation.create.mockResolvedValue(makeConversation())

      const result = await service.findOrCreateDm(userA, userB)
      expect(result.id).toBe(convId)
    })
  })

  describe('createGroupDm', () => {
    const userC = 'user-c'

    it('deduplicates members and includes current user', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: userA, dmPrivacy: 'everyone' },
        { id: userB, dmPrivacy: 'everyone' },
        { id: userC, dmPrivacy: 'everyone' },
      ])
      prisma.directConversation.create.mockResolvedValue({
        ...makeConversation({ isGroup: true }),
        members: [
          { userId: userA, user: { id: userA, username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null, status: 'online', createdAt: new Date() } },
          { userId: userB, user: { id: userB, username: 'bob', displayName: 'Bob', avatarUrl: null, bio: null, status: 'online', createdAt: new Date() } },
          { userId: userC, user: { id: userC, username: 'charlie', displayName: 'Charlie', avatarUrl: null, bio: null, status: 'online', createdAt: new Date() } },
        ],
      })

      const result = await service.createGroupDm(userA, [userA, userB, userC])
      expect(result.isGroup).toBe(true)
    })

    it('throws when fewer than 3 unique participants', async () => {
      await expect(service.createGroupDm(userA, [userB])).rejects.toThrow('at least 3 participants')
    })

    it('throws when more than 10 participants', async () => {
      const ids = Array.from({ length: 11 }, (_, i) => `user-${i}`)
      await expect(service.createGroupDm(userA, ids)).rejects.toThrow('limited to 10')
    })

    it('throws when some users not found', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: userA }, { id: userB }]) // missing userC
      await expect(service.createGroupDm(userA, [userB, userC])).rejects.toThrow('One or more users not found')
    })

    it('throws when friends_only user is not friends with all members', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: userA, dmPrivacy: 'everyone' },
        { id: userB, dmPrivacy: 'friends_only' },
        { id: userC, dmPrivacy: 'everyone' },
      ])
      // New implementation: single friendship.findMany — return only userA↔userB friendship (not userB↔userC)
      prisma.friendship.findMany.mockResolvedValue([
        { requesterId: userA, addresseeId: userB },
      ])

      await expect(service.createGroupDm(userA, [userB, userC])).rejects.toThrow('must be friends')
    })

    it('loads all friendships in a single query (N+1 regression)', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: userA, dmPrivacy: 'friends_only' },
        { id: userB, dmPrivacy: 'friends_only' },
        { id: userC, dmPrivacy: 'friends_only' },
      ])
      prisma.friendship.findMany.mockResolvedValue([
        { requesterId: userA, addresseeId: userB },
        { requesterId: userA, addresseeId: userC },
        { requesterId: userB, addresseeId: userC },
      ])
      prisma.directConversation.create.mockResolvedValue({
        ...makeConversation({ isGroup: true }),
        members: [],
      })

      await service.createGroupDm(userA, [userB, userC])

      // Exactly ONE friendship query regardless of group size
      expect(prisma.friendship.findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('canDmUser', () => {
    it('returns allowed for self', async () => {
      const result = await service.canDmUser(userA, userA)
      expect(result).toEqual({ allowed: true })
    })

    it('returns not allowed when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)
      const result = await service.canDmUser(userA, 'nonexistent')
      expect(result).toEqual({ allowed: false })
    })

    it('returns allowed when privacy is everyone', async () => {
      prisma.user.findUnique.mockResolvedValue({ dmPrivacy: 'everyone' })
      const result = await service.canDmUser(userA, userB)
      expect(result).toEqual({ allowed: true })
    })

    it('returns allowed when friends_only and they are friends', async () => {
      prisma.user.findUnique.mockResolvedValue({ dmPrivacy: 'friends_only' })
      friends.areFriends.mockResolvedValue(true)
      const result = await service.canDmUser(userA, userB)
      expect(result).toEqual({ allowed: true })
    })

    it('returns not allowed when friends_only and not friends', async () => {
      prisma.user.findUnique.mockResolvedValue({ dmPrivacy: 'friends_only' })
      friends.areFriends.mockResolvedValue(false)
      const result = await service.canDmUser(userA, userB)
      expect(result).toEqual({ allowed: false })
    })
  })

  describe('createMessage', () => {
    beforeEach(() => {
      prisma.directConversationMember.findUnique.mockResolvedValue({ conversationId: convId, userId: userA })
    })

    it('throws when no content and no attachments', async () => {
      await expect(service.createMessage(convId, userA, '  ')).rejects.toThrow(
        'Message must have content or at least one attachment',
      )
    })

    it('throws when replyToId is invalid', async () => {
      prisma.message.findFirst.mockResolvedValue(null)
      await expect(service.createMessage(convId, userA, 'Hello', 'bad-reply')).rejects.toThrow('Invalid replyToId')
    })

    it('creates a message via transaction', async () => {
      const msg = makeDmMessage()
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          attachment: { findMany: jest.fn().mockResolvedValue([]) },
          message: { create: jest.fn().mockResolvedValue(msg) },
          directConversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        }
        return fn(tx)
      })

      const result = await service.createMessage(convId, userA, 'Hello')
      expect(result.id).toBe('msg-1')
      expect(result.content).toBe('Hello')
    })

    it('creates a message with attachments', async () => {
      const msg = makeDmMessage({ attachments: [{ id: 'att-1' }] })
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          attachment: { findMany: jest.fn().mockResolvedValue([{ id: 'att-1' }]) },
          message: { create: jest.fn().mockResolvedValue(msg) },
          directConversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        }
        return fn(tx)
      })

      const result = await service.createMessage(convId, userA, undefined, undefined, ['att-1'])
      expect(result.id).toBe('msg-1')
    })

    it('reopens closed members when creating a message', async () => {
      const msg = makeDmMessage()
      let updateManyCalled = false
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          attachment: { findMany: jest.fn() },
          message: { create: jest.fn().mockResolvedValue(msg) },
          directConversationMember: {
            updateMany: jest.fn().mockImplementation(() => {
              updateManyCalled = true
              return { count: 1 }
            }),
          },
        }
        return fn(tx)
      })

      await service.createMessage(convId, userA, 'Hello')
      expect(updateManyCalled).toBe(true)
    })
  })

  describe('editMessage', () => {
    beforeEach(() => {
      prisma.directConversationMember.findUnique.mockResolvedValue({ conversationId: convId, userId: userA })
    })

    it('edits own message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1', authorId: userA, deleted: false })
      const updated = makeDmMessage({ content: 'Edited' })
      prisma.message.update.mockResolvedValue(updated)

      const result = await service.editMessage(convId, 'msg-1', userA, 'Edited')
      expect(result.content).toBe('Edited')
    })

    it('throws when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)
      await expect(service.editMessage(convId, 'bad', userA, 'Edited')).rejects.toThrow(NotFoundException)
    })

    it('throws when editing a deleted message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1', authorId: userA, deleted: true })
      await expect(service.editMessage(convId, 'msg-1', userA, 'Edited')).rejects.toThrow('Cannot edit a deleted message')
    })

    it('throws when editing another user\'s message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1', authorId: userB, deleted: false })
      await expect(service.editMessage(convId, 'msg-1', userA, 'Edited')).rejects.toThrow('only edit your own')
    })
  })

  describe('deleteMessage', () => {
    beforeEach(() => {
      prisma.directConversationMember.findUnique.mockResolvedValue({ conversationId: convId, userId: userA })
    })

    it('soft-deletes own message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1', authorId: userA, deleted: false })
      prisma.message.update.mockResolvedValue({})

      const result = await service.deleteMessage(convId, 'msg-1', userA)
      expect(result).toEqual({ id: 'msg-1', deleted: true })
    })

    it('returns immediately for already deleted message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1', authorId: userA, deleted: true })

      const result = await service.deleteMessage(convId, 'msg-1', userA)
      expect(result).toEqual({ id: 'msg-1', deleted: true })
      expect(prisma.message.update).not.toHaveBeenCalled()
    })

    it('throws when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)
      await expect(service.deleteMessage(convId, 'bad', userA)).rejects.toThrow(NotFoundException)
    })

    it('throws when deleting another user\'s message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1', authorId: userB, deleted: false })
      await expect(service.deleteMessage(convId, 'msg-1', userA)).rejects.toThrow('only delete your own')
    })
  })
})
