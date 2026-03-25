import { Prisma } from '@prisma/client'

export const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true
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
  webhook: { select: { name: true, avatarUrl: true } }
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

export function mapMessageToWire(m: MessageWithRelations) {
  const { reactions, webhookName, webhookAvatarUrl, ...rest } = m
  return {
    ...rest,
    reactions: groupReactions(reactions),
    webhook: m.webhookId
      ? {
          name: webhookName || m.webhook?.name || 'Webhook',
          avatarUrl: webhookAvatarUrl || m.webhook?.avatarUrl || null
        }
      : null
  }
}

export function mapDmMessageToWire(m: DmMessageWithRelations) {
  const { reactions, ...rest } = m
  return { ...rest, reactions: groupReactions(reactions) }
}
