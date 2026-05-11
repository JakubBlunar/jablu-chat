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

type ForwardedFromFields = {
  forwardedFromId: string | null
  forwardedFromChannelId: string | null
  forwardedFromDmId: string | null
  forwardedFromAuthorId: string | null
  forwardedFromAuthorName: string | null
  forwardedFromChannelName: string | null
  forwardedFromContent: string | null
  forwardedFromCreatedAt: Date | string | null
}

type ForwardedFromWire = {
  id: string | null
  channelId: string | null
  dmId: string | null
  authorId: string | null
  authorName: string | null
  channelName: string | null
  content: string | null
  createdAt: string | null
} | null

function buildForwardedFrom(m: ForwardedFromFields): ForwardedFromWire {
  if (!m.forwardedFromAuthorName && !m.forwardedFromContent && !m.forwardedFromCreatedAt) {
    return null
  }
  const createdAt =
    m.forwardedFromCreatedAt instanceof Date
      ? m.forwardedFromCreatedAt.toISOString()
      : m.forwardedFromCreatedAt ?? null
  return {
    id: m.forwardedFromId ?? null,
    channelId: m.forwardedFromChannelId ?? null,
    dmId: m.forwardedFromDmId ?? null,
    authorId: m.forwardedFromAuthorId ?? null,
    authorName: m.forwardedFromAuthorName ?? null,
    channelName: m.forwardedFromChannelName ?? null,
    content: m.forwardedFromContent ?? null,
    createdAt
  }
}

export function mapMessageToWire(m: MessageWithRelations, requestingUserId?: string) {
  const {
    reactions,
    webhookName,
    webhookAvatarUrl,
    poll,
    _count,
    threadMessages,
    embeds: rawEmbeds,
    forwardedFromId,
    forwardedFromChannelId,
    forwardedFromDmId,
    forwardedFromAuthorId,
    forwardedFromAuthorName,
    forwardedFromChannelName,
    forwardedFromContent,
    forwardedFromCreatedAt,
    ...rest
  } = m
  const embeds = Array.isArray(rawEmbeds) && rawEmbeds.length > 0 ? rawEmbeds : undefined
  const lastReply = threadMessages?.[0] ?? null
  const forwardedFrom = buildForwardedFrom({
    forwardedFromId,
    forwardedFromChannelId,
    forwardedFromDmId,
    forwardedFromAuthorId,
    forwardedFromAuthorName,
    forwardedFromChannelName,
    forwardedFromContent,
    forwardedFromCreatedAt
  })
  return {
    ...rest,
    embeds,
    forwardedFrom,
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
  const {
    reactions,
    forwardedFromId,
    forwardedFromChannelId,
    forwardedFromDmId,
    forwardedFromAuthorId,
    forwardedFromAuthorName,
    forwardedFromChannelName,
    forwardedFromContent,
    forwardedFromCreatedAt,
    ...rest
  } = m
  const forwardedFrom = buildForwardedFrom({
    forwardedFromId,
    forwardedFromChannelId,
    forwardedFromDmId,
    forwardedFromAuthorId,
    forwardedFromAuthorName,
    forwardedFromChannelName,
    forwardedFromContent,
    forwardedFromCreatedAt
  })
  return { ...rest, forwardedFrom, reactions: groupReactions(reactions) }
}
