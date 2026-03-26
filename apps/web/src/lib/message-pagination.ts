import type { Message } from '@chat/shared'

export const MAX_MESSAGES = 250

export function toChronological(messagesDesc: Message[]): Message[] {
  return messagesDesc.slice().reverse()
}

export function trimOldest(msgs: Message[]): Message[] {
  return msgs.length > MAX_MESSAGES ? msgs.slice(msgs.length - MAX_MESSAGES) : msgs
}

export function trimNewest(msgs: Message[]): Message[] {
  return msgs.length > MAX_MESSAGES ? msgs.slice(0, MAX_MESSAGES) : msgs
}
