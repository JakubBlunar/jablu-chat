import { Prisma } from '../prisma-client'

export const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isBot: true
} as const

export const messageInclude = {
  author: { select: authorSelect },
  attachments: true,
  reactions: { select: { emoji: true, userId: true, isCustom: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      author: { select: authorSelect }
    }
  },
  linkPreviews: {
    select: {
      id: true,
      url: true,
      title: true,
      description: true,
      imageUrl: true,
      siteName: true
    }
  },
  webhook: { select: { name: true, avatarUrl: true } },
  poll: {
    include: {
      options: {
        orderBy: { position: 'asc' },
        include: { votes: { select: { userId: true } } }
      }
    }
  },
  _count: { select: { threadMessages: true } },
  threadMessages: {
    where: { deleted: false },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      content: true,
      createdAt: true,
      author: { select: authorSelect }
    }
  }
} satisfies Prisma.MessageInclude

export const dmMessageInclude = {
  author: { select: authorSelect },
  attachments: true,
  reactions: { select: { emoji: true, userId: true, isCustom: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      author: { select: authorSelect }
    }
  },
  linkPreviews: {
    select: {
      id: true,
      url: true,
      title: true,
      description: true,
      imageUrl: true,
      siteName: true
    }
  }
} satisfies Prisma.MessageInclude

export type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof messageInclude }>
export type DmMessageWithRelations = Prisma.MessageGetPayload<{ include: typeof dmMessageInclude }>

export function groupReactions(
  reactions: { emoji: string; userId: string; isCustom: boolean }[]
): { emoji: string; count: number; userIds: string[]; isCustom: boolean }[] {
  const map = new Map<string, { emoji: string; count: number; userIds: string[]; isCustom: boolean }>()
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [] as string[], isCustom: r.isCustom }
    cur.count += 1
    cur.userIds.push(r.userId)
    map.set(r.emoji, cur)
  }
  return [...map.values()]
}

export function mapMessageToWire(m: MessageWithRelations, requestingUserId?: string) {
  const { reactions, webhookName, webhookAvatarUrl, poll, _count, threadMessages, embeds: rawEmbeds, ...rest } = m
  const embeds = Array.isArray(rawEmbeds) && rawEmbeds.length > 0 ? rawEmbeds : undefined
  const lastReply = threadMessages?.[0] ?? null
  return {
    ...rest,
    embeds,
    threadCount: _count?.threadMessages ?? 0,
    lastThreadReply: lastReply
      ? {
          content: lastReply.content,
          author: lastReply.author ?? null,
          createdAt: lastReply.createdAt instanceof Date ? lastReply.createdAt.toISOString() : lastReply.createdAt
        }
      : null,
    reactions: groupReactions(reactions),
    webhook: m.webhookId
      ? {
          name: webhookName || m.webhook?.name || 'Webhook',
          avatarUrl: webhookAvatarUrl || m.webhook?.avatarUrl || null
        }
      : null,
    poll: poll
      ? {
          id: poll.id,
          messageId: poll.messageId,
          question: poll.question,
          multiSelect: poll.multiSelect,
          expiresAt: poll.expiresAt?.toISOString() ?? null,
          createdAt: poll.createdAt.toISOString(),
          options: poll.options.map((o) => ({
            id: o.id,
            label: o.label,
            position: o.position,
            voteCount: o.votes.length,
            voted: requestingUserId ? o.votes.some((v) => v.userId === requestingUserId) : false
          }))
        }
      : null
  }
}

export function mapDmMessageToWire(m: DmMessageWithRelations) {
  const { reactions, ...rest } = m
  return { ...rest, reactions: groupReactions(reactions) }
}
