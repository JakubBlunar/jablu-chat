import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ForumPostsService } from './forum-posts.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { EventBusService } from '../events/event-bus.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('ForumPostsService', () => {
  let service: ForumPostsService
  let prisma: MockPrismaService
  let roles: { requirePermission: jest.Mock; requireChannelPermission: jest.Mock; getChannelPermissions: jest.Mock }
  let events: { emit: jest.Mock }

  const userId = 'user-1'
  const channelId = 'channel-1'
  const serverId = 'server-1'

  const forumChannel = {
    id: channelId,
    serverId,
    type: 'forum',
    requireTags: false,
    defaultSortOrder: 'latest_activity',
    defaultLayout: 'list'
  }

  const forumChannelRequireTags = { ...forumChannel, requireTags: true }

  function makePost(overrides: Record<string, unknown> = {}) {
    return {
      id: 'post-1',
      channelId,
      authorId: userId,
      title: 'Test Post',
      content: 'Post body',
      deleted: false,
      pinned: false,
      isLocked: false,
      editedAt: null,
      createdAt: new Date('2024-06-01'),
      threadParentId: null,
      author: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null },
      attachments: [],
      reactions: [],
      forumPostTags: [],
      linkPreviews: [],
      _count: { threadMessages: 0 },
      threadMessages: [],
      ...overrides
    }
  }

  beforeEach(async () => {
    prisma = createMockPrismaService()
    prisma.message.groupBy.mockResolvedValue([])
    prisma.message.count.mockResolvedValue(0)
    roles = {
      requirePermission: jest.fn().mockResolvedValue(0n),
      requireChannelPermission: jest.fn().mockResolvedValue(0n),
      getChannelPermissions: jest.fn().mockResolvedValue(0n)
    }
    events = { emit: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForumPostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
        { provide: EventBusService, useValue: events }
      ]
    }).compile()

    service = module.get(ForumPostsService)
  })

  function mockForumChannel(channel = forumChannel) {
    prisma.channel.findUnique.mockResolvedValue(channel)
    prisma.serverMember.findUnique.mockResolvedValue({ userId, serverId })
  }

  describe('listPosts', () => {
    beforeEach(() => mockForumChannel())

    it('returns posts sorted by newest', async () => {
      const posts = [makePost({ id: 'p1' }), makePost({ id: 'p2' })]
      prisma.message.findMany.mockResolvedValue(posts)

      const result = await service.listPosts(channelId, userId, 'newest' as any)
      expect(result.posts).toHaveLength(2)
      expect(result.posts[0].id).toBe('p1')
    })

    it('returns posts sorted by latest_activity', async () => {
      const p1 = makePost({ id: 'p1', createdAt: new Date('2024-01-01'), threadMessages: [] })
      const p2 = makePost({
        id: 'p2',
        createdAt: new Date('2024-01-02'),
        threadMessages: [{ createdAt: new Date('2024-06-01') }]
      })
      prisma.message.findMany.mockResolvedValue([p1, p2])

      const result = await service.listPosts(channelId, userId)
      expect(result.posts[0].id).toBe('p2')
    })

    it('throws if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null)
      await expect(service.listPosts(channelId, userId)).rejects.toThrow(NotFoundException)
    })

    it('throws if channel is not a forum', async () => {
      prisma.channel.findUnique.mockResolvedValue({ ...forumChannel, type: 'text' })
      await expect(service.listPosts(channelId, userId)).rejects.toThrow(BadRequestException)
    })

    it('throws if user is not a member', async () => {
      prisma.channel.findUnique.mockResolvedValue(forumChannel)
      prisma.serverMember.findUnique.mockResolvedValue(null)
      await expect(service.listPosts(channelId, userId)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('getPost', () => {
    beforeEach(() => mockForumChannel())

    it('returns a post', async () => {
      const post = makePost()
      prisma.message.findFirst.mockResolvedValue(post)

      const result = await service.getPost(channelId, 'post-1', userId)
      expect(result.id).toBe('post-1')
      expect(result.title).toBe('Test Post')
    })

    it('throws if post not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)
      await expect(service.getPost(channelId, 'nonexistent', userId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('createPost', () => {
    beforeEach(() => mockForumChannel())

    it('creates a post', async () => {
      const post = makePost()
      prisma.message.create.mockResolvedValue(post)

      const result = await service.createPost(channelId, userId, 'Test Post', 'Post body')
      expect(result.id).toBe('post-1')
      expect(prisma.message.create).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('forum:post:created', expect.objectContaining({ channelId }))
    })

    it('throws if title is empty', async () => {
      await expect(service.createPost(channelId, userId, '  ', 'content')).rejects.toThrow(BadRequestException)
    })

    it('throws if content and attachments are both empty', async () => {
      await expect(service.createPost(channelId, userId, 'Title', '', [])).rejects.toThrow(BadRequestException)
    })

    it('throws if tags are required but not provided', async () => {
      mockForumChannel(forumChannelRequireTags)
      await expect(service.createPost(channelId, userId, 'Title', 'content', [])).rejects.toThrow(
        BadRequestException
      )
    })

    it('throws if provided tags are invalid', async () => {
      prisma.forumTag.count.mockResolvedValue(0)
      await expect(
        service.createPost(channelId, userId, 'Title', 'content', ['invalid-tag'])
      ).rejects.toThrow(BadRequestException)
    })

    it('creates with valid tags', async () => {
      prisma.forumTag.count.mockResolvedValue(1)
      prisma.message.create.mockResolvedValue(makePost({ forumPostTags: [{ tag: { id: 'tag-1', name: 'Bug' } }] }))

      const result = await service.createPost(channelId, userId, 'Title', 'body', ['tag-1'])
      expect(result.tags).toHaveLength(1)
    })
  })

  describe('updatePost', () => {
    beforeEach(() => mockForumChannel())

    it('updates own post title', async () => {
      prisma.message.findFirst.mockResolvedValue(makePost())
      prisma.message.update.mockResolvedValue(makePost({ title: 'Updated' }))

      const result = await service.updatePost(channelId, 'post-1', userId, 'Updated')
      expect(result.title).toBe('Updated')
      expect(events.emit).toHaveBeenCalledWith('forum:post:updated', expect.anything())
    })

    it('throws if post not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)
      await expect(service.updatePost(channelId, 'nonexistent', userId, 'X')).rejects.toThrow(NotFoundException)
    })

    it('throws if non-author without MANAGE_MESSAGES', async () => {
      prisma.message.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }))
      roles.getChannelPermissions.mockResolvedValue(0n)
      await expect(service.updatePost(channelId, 'post-1', userId, 'X')).rejects.toThrow(ForbiddenException)
    })

    it('updates tags', async () => {
      prisma.message.findFirst.mockResolvedValue(makePost())
      prisma.forumPostTag.deleteMany.mockResolvedValue({ count: 0 })
      prisma.forumTag.count.mockResolvedValue(1)
      prisma.forumPostTag.createMany.mockResolvedValue({ count: 1 })
      prisma.message.update.mockResolvedValue(makePost({ forumPostTags: [{ tag: { id: 'tag-1', name: 'Bug' } }] }))

      const result = await service.updatePost(channelId, 'post-1', userId, undefined, undefined, ['tag-1'])
      expect(result.tags).toHaveLength(1)
    })
  })

  describe('deletePost', () => {
    beforeEach(() => mockForumChannel())

    it('soft-deletes own post', async () => {
      prisma.message.findFirst.mockResolvedValue(makePost())
      prisma.message.update.mockResolvedValue(makePost({ deleted: true }))

      const result = await service.deletePost(channelId, 'post-1', userId)
      expect(result.deleted).toBe(true)
      expect(events.emit).toHaveBeenCalledWith('forum:post:deleted', expect.objectContaining({ postId: 'post-1' }))
    })

    it('throws if post not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)
      await expect(service.deletePost(channelId, 'nonexistent', userId)).rejects.toThrow(NotFoundException)
    })

    it('throws if non-author without MANAGE_MESSAGES', async () => {
      prisma.message.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }))
      roles.getChannelPermissions.mockResolvedValue(0n)
      await expect(service.deletePost(channelId, 'post-1', userId)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('lockPost', () => {
    beforeEach(() => mockForumChannel())

    it('locks a post', async () => {
      prisma.message.findFirst.mockResolvedValue(makePost())
      prisma.message.update.mockResolvedValue(makePost({ isLocked: true }))

      const result = await service.lockPost(channelId, 'post-1', userId)
      expect(result.isLocked).toBe(true)
      expect(events.emit).toHaveBeenCalledWith('forum:post:updated', expect.anything())
    })

    it('throws if post not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)
      await expect(service.lockPost(channelId, 'nonexistent', userId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('unlockPost', () => {
    beforeEach(() => mockForumChannel())

    it('unlocks a post', async () => {
      prisma.message.findFirst.mockResolvedValue(makePost({ isLocked: true }))
      prisma.message.update.mockResolvedValue(makePost({ isLocked: false }))

      const result = await service.unlockPost(channelId, 'post-1', userId)
      expect(result.isLocked).toBe(false)
    })
  })
})
