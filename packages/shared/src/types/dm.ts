export interface DirectConversation {
  id: string
  isGroup: boolean
  groupName: string | null
  createdAt: string
  members?: DirectConversationMemberInfo[]
  lastMessage?: {
    content: string
    authorId: string
    createdAt: string
  } | null
}

export interface DirectConversationMemberInfo {
  userId: string
  username: string
  avatarUrl: string | null
  status: string
}

export interface DmCall {
  id: string
  conversationId: string
  callerId: string
  callerName: string
  createdAt: string
  ringingUntil: string | null
  ringingUserIds: string[]
  participants: {
    userId: string
    username: string
    muted?: boolean
    deafened?: boolean
    camera?: boolean
    screenShare?: boolean
  }[]
}

export type DmCallEndReason = 'hangup' | 'declined' | 'timeout' | 'disconnected'

export type DmCallReply<T> = { ok: true; data: T } | { ok: false; error: string }
