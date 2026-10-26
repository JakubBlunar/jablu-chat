import type { Message } from '@chat/shared'

export function updateMessageInList(
  messages: Message[],
  messageId: string,
  update: (message: Message) => Message
): Message[] {
  const index = messages.findIndex((message) => message.id === messageId)
  if (index === -1) return messages
  const next = update(messages[index])
  if (next === messages[index]) return messages
  const result = messages.slice()
  result[index] = next
  return result
}

export function replaceMessageInList(messages: Message[], message: Message): Message[] {
  return updateMessageInList(messages, message.id, () => message)
}

export function removeMessageFromList(messages: Message[], messageId: string): Message[] {
  const index = messages.findIndex((message) => message.id === messageId)
  return index === -1 ? messages : [...messages.slice(0, index), ...messages.slice(index + 1)]
}

export function addMessageReaction(
  messages: Message[],
  messageId: string,
  emoji: string,
  userId: string,
  isCustom = false
): Message[] {
  return updateMessageInList(messages, messageId, (message) => {
    const reactions = message.reactions ?? []
    const existing = reactions.find((reaction) => reaction.emoji === emoji)
    if (existing?.userIds.includes(userId)) return message
    return {
      ...message,
      reactions: existing
        ? reactions.map((reaction) =>
            reaction === existing
              ? { ...reaction, count: reaction.count + 1, userIds: [...reaction.userIds, userId] }
              : reaction
          )
        : [...reactions, { emoji, count: 1, userIds: [userId], isCustom }]
    }
  })
}

export function removeMessageReaction(
  messages: Message[],
  messageId: string,
  emoji: string,
  userId: string
): Message[] {
  return updateMessageInList(messages, messageId, (message) => {
    const reactions = message.reactions ?? []
    const existing = reactions.find((reaction) => reaction.emoji === emoji)
    if (!existing || (existing.usersComplete !== false && !existing.userIds.includes(userId))) return message
    const userIds = existing.userIds.filter((id) => id !== userId)
    const count = Math.max(0, existing.count - 1)
    return {
      ...message,
      reactions: count
        ? reactions.map((reaction) =>
            reaction === existing ? { ...reaction, userIds, count } : reaction
          )
        : reactions.filter((reaction) => reaction !== existing)
    }
  })
}

export function messageListPatch<S extends { messages: Message[] }>(
  state: S,
  messages: Message[]
): S | Pick<S, 'messages'> {
  return messages === state.messages ? state : { messages }
}
