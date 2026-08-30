import type { Channel, ChannelCategory, Message, Server } from '@chat/shared'
import type { DmConversation } from '@/lib/api'

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

export function makeServer(id: string, overrides: Partial<Server> = {}): Server {
  return {
    id,
    name: `Server ${id}`,
    iconUrl: null,
    ownerId: 'user-1',
    createdAt: new Date(0).toISOString(),
    ...overrides
  }
}

export function makeChannel(id: string, serverId: string, overrides: Partial<Channel> = {}): Channel {
  return {
    id,
    serverId,
    categoryId: null,
    name: id,
    type: 'text',
    position: 0,
    isArchived: false,
    createdAt: new Date(0).toISOString(),
    ...overrides
  }
}

export function makeCategory(
  id: string,
  serverId: string,
  overrides: Partial<ChannelCategory> = {}
): ChannelCategory {
  return {
    id,
    serverId,
    name: id,
    position: 0,
    createdAt: new Date(0).toISOString(),
    ...overrides
  }
}

export function makeDmConversation(
  id: string,
  overrides: Partial<DmConversation> = {}
): DmConversation {
  return {
    id,
    isGroup: false,
    groupName: null,
    createdAt: new Date(0).toISOString(),
    members: [
      {
        userId: 'user-2',
        username: 'friend',
        displayName: null,
        avatarUrl: null,
        bio: null,
        status: 'online',
        createdAt: new Date(0).toISOString()
      }
    ],
    ...overrides
  }
}
