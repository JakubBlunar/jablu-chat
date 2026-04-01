import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ChannelType, ForumSortOrder, Prisma } from '@prisma/client'
import { Permission, hasPermission } from '@chat/shared'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { authorSelect } from '../messages/message-wire'

const postInclude = {
  author: { select: authorSelect },
  attachments: true,
  reactions: { select: { emoji: true, userId: true, isCustom: true } },
  linkPreviews: {
    select: { id: true, url: true, title: true, description: true, imageUrl: true, siteName: true }
  },
  forumPostTags: { include: { tag: true } },
  threadMessages: {
    where: { deleted: false },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { createdAt: true }
  }
} satisfies Prisma.MessageInclude

type PostWithRelations = Prisma.MessageGetPayload<{ include: typeof postInclude }>

@Injectable()
export class ForumPostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly events: EventBusService
  ) {}

  private async requireForumChannel(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) throw new NotFoundException('Channel not found')
    if (channel.type !== ChannelType.forum) throw new BadRequestException('Channel is not a forum')
    const membership = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } }
    })
    if (!membership) throw new ForbiddenException('You are not a member of this server')
    await this.roles.requireChannelPermission(channel.serverId, channelId, userId, Permission.VIEW_CHANNEL)
    return channel
  }

  private mapPostToWire(post: PostWithRelations, replyCount: number) {
    const { threadMessages, forumPostTags, reactions, ...rest } = post
    const lastActivity = threadMessages?.[0]?.createdAt ?? post.createdAt
    const reactionMap = new Map<string, { emoji: string; count: number; userIds: string[]; isCustom: boolean }>()
    for (const r of reactions) {
      const cur = reactionMap.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [], isCustom: r.isCustom }
      cur.count += 1
      cur.userIds.push(r.userId)
      reactionMap.set(r.emoji, cur)
    }
    return {
      ...rest,
      replyCount,
      lastActivityAt: lastActivity instanceof Date ? lastActivity.toISOString() : lastActivity,
      tags: forumPostTags.map((pt) => pt.tag),
      reactions: [...reactionMap.values()]
    }
  }

  async listPosts(
    channelId: string,
    userId: string,
    sort: ForumSortOrder = ForumSortOrder.latest_activity,
    tagId?: string,
    cursor?: string,
    limit = 25
  ) {
    const channel = await this.requireForumChannel(channelId, userId)
    const take = Math.min(Math.max(1, limit), 50)

    const where: Prisma.MessageWhereInput = {
      channelId,
      deleted: false,
      threadParentId: null,
      title: { not: null },
      ...(tagId ? { forumPostTags: { some: { tagId } } } : {})
    }

    if (cursor) {
      const cursorPost = await this.prisma.message.findFirst({
        where: { id: cursor, channelId, deleted: false }
      })
      if (!cursorPost) throw new BadRequestException('Invalid cursor')
    }

    let posts: PostWithRelations[]

    if (sort === ForumSortOrder.newest) {
      posts = await this.prisma.message.findMany({
        where: cursor
          ? {
              ...where,
              createdAt: {
                lt: (await this.prisma.message.findUniqueOrThrow({ where: { id: cursor } })).createdAt
              }
            }
          : where,
        orderBy: { createdAt: 'desc' },
        take,
        include: postInclude
      })
    } else {
      // latest_activity: sort by most recent thread reply (or post creation if no replies)
      // We use a raw approach: fetch posts then sort by computed lastActivity
      const allPosts = await this.prisma.message.findMany({
        where,
        include: postInclude,
        take: take * 3, // fetch more to account for sorting differences
        orderBy: { createdAt: 'desc' }
      })

      allPosts.sort((a, b) => {
        const aTime = a.threadMessages?.[0]?.createdAt ?? a.createdAt
        const bTime = b.threadMessages?.[0]?.createdAt ?? b.createdAt
        return bTime.getTime() - aTime.getTime()
      })

      if (cursor) {
        const idx = allPosts.findIndex((p) => p.id === cursor)
        posts = allPosts.slice(idx + 1, idx + 1 + take)
      } else {
        posts = allPosts.slice(0, take)
      }
    }

    const postIds = posts.map((p) => p.id)
    const counts = postIds.length > 0
      ? await this.prisma.message.groupBy({
          by: ['threadParentId'],
          where: {
            threadParentId: { in: postIds },
            deleted: false
          },
          _count: { _all: true }
        }) ?? []
      : []
    const countMap = new Map<string, number>()
    for (const row of counts) {
      if (row.threadParentId) countMap.set(row.threadParentId, row._count._all)
    }

    return {
      posts: posts.map((p) => this.mapPostToWire(p, countMap.get(p.id) ?? 0)),
      hasMore: posts.length === take
    }
  }

  async getPost(channelId: string, postId: string, userId: string) {
    await this.requireForumChannel(channelId, userId)
    const post = await this.prisma.message.findFirst({
      where: { id: postId, channelId, deleted: false, threadParentId: null },
      include: postInclude
    })
    if (!post) throw new NotFoundException('Post not found')
    const replyCount = await this.prisma.message.count({
      where: { threadParentId: postId, deleted: false }
    })
    return this.mapPostToWire(post, replyCount)
  }

  async createPost(
    channelId: string,
    userId: string,
    title: string,
    content?: string,
    tagIds?: string[],
    attachmentIds?: string[]
  ) {
    const channel = await this.requireForumChannel(channelId, userId)
    await this.roles.requireChannelPermission(channel.serverId, channelId, userId, Permission.SEND_MESSAGES)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) throw new BadRequestException('Title is required')

    const trimmedContent = content?.trim()
    const hasAttachments = !!attachmentIds?.length
    if (!trimmedContent && !hasAttachments) {
      throw new BadRequestException('Post must have content or at least one attachment')
    }

    if (channel.requireTags && (!tagIds || tagIds.length === 0)) {
      throw new BadRequestException('This forum requires at least one tag')
    }

    if (tagIds?.length) {
      const validTags = await this.prisma.forumTag.count({
        where: { id: { in: tagIds }, channelId }
      })
      if (validTags !== tagIds.length) throw new BadRequestException('One or more tags are invalid')
    }

    const post = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        title: trimmedTitle,
        content: trimmedContent || null,
        ...(attachmentIds?.length
          ? { attachments: { connect: attachmentIds.map((id) => ({ id })) } }
          : {}),
        ...(tagIds?.length
          ? { forumPostTags: { create: tagIds.map((tagId) => ({ tagId })) } }
          : {})
      },
      include: postInclude
    })

    const wire = this.mapPostToWire(post, 0)
    this.events.emit('forum:post:created', { channelId, serverId: channel.serverId, post: wire })
    return wire
  }

  async updatePost(channelId: string, postId: string, userId: string, title?: string, content?: string, tagIds?: string[]) {
    const channel = await this.requireForumChannel(channelId, userId)
    const post = await this.prisma.message.findFirst({
      where: { id: postId, channelId, deleted: false, threadParentId: null }
    })
    if (!post) throw new NotFoundException('Post not found')

    const isAuthor = post.authorId === userId
    if (!isAuthor) {
      const perms = await this.roles.getChannelPermissions(channel.serverId, channelId, userId)
      if (!hasPermission(perms, Permission.MANAGE_MESSAGES)) {
        throw new ForbiddenException('You can only edit your own posts')
      }
    }

    const data: Prisma.MessageUpdateInput = {}
    if (title !== undefined) {
      const trimmed = title.trim()
      if (!trimmed) throw new BadRequestException('Title cannot be empty')
      data.title = trimmed
      data.editedAt = new Date()
    }
    if (content !== undefined) {
      data.content = content.trim() || null
      data.editedAt = new Date()
    }

    if (tagIds !== undefined) {
      await this.prisma.forumPostTag.deleteMany({ where: { messageId: postId } })
      if (tagIds.length > 0) {
        const validTags = await this.prisma.forumTag.count({
          where: { id: { in: tagIds }, channelId }
        })
        if (validTags !== tagIds.length) throw new BadRequestException('One or more tags are invalid')
        await this.prisma.forumPostTag.createMany({
          data: tagIds.map((tagId) => ({ messageId: postId, tagId }))
        })
      }
    }

    const updated = await this.prisma.message.update({
      where: { id: postId },
      data,
      include: postInclude
    })

    const replyCount = await this.prisma.message.count({
      where: { threadParentId: postId, deleted: false }
    })
    const wire = this.mapPostToWire(updated, replyCount)
    this.events.emit('forum:post:updated', { channelId, serverId: channel.serverId, post: wire })
    return wire
  }

  async deletePost(channelId: string, postId: string, userId: string) {
    const channel = await this.requireForumChannel(channelId, userId)
    const post = await this.prisma.message.findFirst({
      where: { id: postId, channelId, deleted: false, threadParentId: null }
    })
    if (!post) throw new NotFoundException('Post not found')

    const isAuthor = post.authorId === userId
    if (!isAuthor) {
      const perms = await this.roles.getChannelPermissions(channel.serverId, channelId, userId)
      if (!hasPermission(perms, Permission.MANAGE_MESSAGES)) {
        throw new ForbiddenException('You can only delete your own posts')
      }
    }

    await this.prisma.message.update({
      where: { id: postId },
      data: { deleted: true, content: null, title: null }
    })

    this.events.emit('forum:post:deleted', { channelId, serverId: channel.serverId, postId })
    return { id: postId, deleted: true }
  }

  async lockPost(channelId: string, postId: string, userId: string) {
    const channel = await this.requireForumChannel(channelId, userId)
    await this.roles.requireChannelPermission(channel.serverId, channelId, userId, Permission.MANAGE_MESSAGES)

    const post = await this.prisma.message.findFirst({
      where: { id: postId, channelId, deleted: false, threadParentId: null }
    })
    if (!post) throw new NotFoundException('Post not found')

    const updated = await this.prisma.message.update({
      where: { id: postId },
      data: { isLocked: true },
      include: postInclude
    })
    const replyCount = await this.prisma.message.count({
      where: { threadParentId: postId, deleted: false }
    })
    const wire = this.mapPostToWire(updated, replyCount)
    this.events.emit('forum:post:updated', { channelId, serverId: channel.serverId, post: wire })
    return wire
  }

  async unlockPost(channelId: string, postId: string, userId: string) {
    const channel = await this.requireForumChannel(channelId, userId)
    await this.roles.requireChannelPermission(channel.serverId, channelId, userId, Permission.MANAGE_MESSAGES)

    const post = await this.prisma.message.findFirst({
      where: { id: postId, channelId, deleted: false, threadParentId: null }
    })
    if (!post) throw new NotFoundException('Post not found')

    const updated = await this.prisma.message.update({
      where: { id: postId },
      data: { isLocked: false },
      include: postInclude
    })
    const replyCount = await this.prisma.message.count({
      where: { threadParentId: postId, deleted: false }
    })
    const wire = this.mapPostToWire(updated, replyCount)
    this.events.emit('forum:post:updated', { channelId, serverId: channel.serverId, post: wire })
    return wire
  }
}
