import type { Message } from '@chat/shared'

let _msgSeq = 0

export function makeMessage(overrides: Partial<Message> = {}): Message {
  _msgSeq++
  return {
    id: `msg-${_msgSeq}`,
    channelId: 'ch-1',
    directConversationId: null,
    authorId: 'user-1',
    replyToId: null,
    threadParentId: null,
    webhookId: null,
    content: `Message ${_msgSeq}`,
    pinned: false,
    createdAt: new Date(Date.now() - (1000 - _msgSeq) * 60_000).toISOString(),
    editedAt: null,
    author: { id: 'user-1', username: 'testuser', displayName: null, avatarUrl: null },
    attachments: [],
    reactions: [],
    ...overrides
  }
}

export function makeMessages(count: number, overrides: Partial<Message> = {}): Message[] {
  return Array.from({ length: count }, () => makeMessage(overrides))
}

export function resetMsgSeq() {
  _msgSeq = 0
}
