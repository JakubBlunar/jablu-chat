import type { Message, ReactionGroup } from '@chat/shared'

/** Only ordinary human text can be shared without hiding distinct content. */
export function messageGroupKey(message: Message): string | null {
  if (
    !message.authorId ||
    !message.author ||
    message.author.isBot ||
    message.webhookId ||
    message.webhook ||
    !message.content ||
    message.deleted ||
    message.replyToId ||
    message.replyTo ||
    message.title ||
    message.attachments?.length ||
    message.embeds?.length ||
    message.poll ||
    message.forwardedFrom
  )
    return null
  const time = Date.parse(message.createdAt)
  if (!Number.isFinite(time)) return null
  return JSON.stringify([
    message.channelId,
    message.directConversationId,
    message.threadParentId,
    Math.floor(time / 60_000),
    message.content
  ])
}

/** Preserve timeline order; repetitions by the same person start another run. */
export function groupMessages(messages: Message[], boundaryId?: string | null): Message[][] {
  const groups: Message[][] = []
  for (const message of messages) {
    const previous = groups.at(-1)
    const key = messageGroupKey(message)
    if (
      previous &&
      previous.length < 50 &&
      message.id !== boundaryId &&
      key &&
      key === messageGroupKey(previous[0]) &&
      !previous.some((m) => m.authorId === message.authorId)
    ) {
      previous.push(message)
    } else groups.push([message])
  }
  return groups
}

/** Count people, not the number of originals they reacted to. */
export function aggregateReactions(messages: Message[]): ReactionGroup[] {
  const groups = new Map<string, ReactionGroup>()
  for (const message of messages) {
    for (const reaction of message.reactions ?? []) {
      const key = JSON.stringify([reaction.isCustom, reaction.emoji])
      const current = groups.get(key)
      const userIds = [...new Set([...(current?.userIds ?? []), ...reaction.userIds])]
      groups.set(key, {
        ...reaction,
        userIds,
        count: userIds.length,
        usersComplete: reaction.usersComplete !== false && current?.usersComplete !== false
      })
    }
  }
  return [...groups.values()]
}
