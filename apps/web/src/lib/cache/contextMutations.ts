import type { LinkPreview, Message, Poll } from '@chat/shared'
import { type CacheKey, cacheKeys, updateContext } from './messageCache'

/**
 * Applies the same edits the visible stores apply, but to cached contexts the
 * user is not currently looking at.
 *
 * The gateway keeps every visible channel subscribed, so these events arrive
 * for background channels too. Without this, returning to a cached channel
 * would show a snapshot frozen at the moment the user left it.
 */

/** Several events carry no channel id, so the message is located by scanning. */
function updateMessageAnywhere(messageId: string, patch: (msg: Message) => Message): void {
  for (const key of cacheKeys()) {
    let found = false
    updateContext(key, (entry) => {
      if (!entry.messages.some((m) => m.id === messageId)) return null
      found = true
      return { ...entry, messages: entry.messages.map((m) => (m.id === messageId ? patch(m) : m)) }
    })
    // A message id is unique across channels, so the first hit is the only one.
    if (found) return
  }
}

export function cacheAddMessage(key: CacheKey, message: Message): void {
  updateContext(key, (entry) => {
    // A context cached mid-history is not at the live edge, so appending here
    // would fabricate a gap. stashCurrent avoids caching those.
    if (entry.hasNewer) return null
    if (entry.messages.some((m) => m.id === message.id)) return null
    return { ...entry, messages: [...entry.messages, message] }
  })
}

export function cacheUpdateMessage(message: Message): void {
  updateMessageAnywhere(message.id, () => message)
}

export function cacheRemoveMessage(key: CacheKey, messageId: string): void {
  updateContext(key, (entry) => {
    if (!entry.messages.some((m) => m.id === messageId)) return null
    return { ...entry, messages: entry.messages.filter((m) => m.id !== messageId) }
  })
}

export function cacheAddReaction(
  messageId: string,
  emoji: string,
  userId: string,
  isCustom = false
): void {
  updateMessageAnywhere(messageId, (msg) => {
    const reactions = msg.reactions ?? []
    const existing = reactions.find((r) => r.emoji === emoji)
    if (!existing) {
      return { ...msg, reactions: [...reactions, { emoji, count: 1, userIds: [userId], isCustom }] }
    }
    if (existing.userIds.includes(userId)) return msg
    return {
      ...msg,
      reactions: reactions.map((r) =>
        r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] } : r
      )
    }
  })
}

export function cacheRemoveReaction(messageId: string, emoji: string, userId: string): void {
  updateMessageAnywhere(messageId, (msg) => ({
    ...msg,
    reactions: (msg.reactions ?? [])
      .map((r) => {
        if (r.emoji !== emoji) return r
        const userIds = r.userIds.filter((id) => id !== userId)
        return { ...r, count: userIds.length, userIds }
      })
      .filter((r) => r.count > 0)
  }))
}

export function cacheSetLinkPreviews(messageId: string, linkPreviews: LinkPreview[]): void {
  updateMessageAnywhere(messageId, (msg) => ({ ...msg, linkPreviews }))
}

export function cacheUpdatePoll(poll: Poll): void {
  updateMessageAnywhere(poll.messageId, (msg) => ({ ...msg, poll }))
}

export function cacheUpdateThreadCount(
  messageId: string,
  threadCount: number,
  lastThreadReply?: Message['lastThreadReply']
): void {
  updateMessageAnywhere(messageId, (msg) => ({
    ...msg,
    threadCount,
    ...(lastThreadReply !== undefined ? { lastThreadReply } : {})
  }))
}
