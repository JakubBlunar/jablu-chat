export type InboxView = 'unread' | 'mentions' | 'replies' | 'later'

export interface InboxTarget {
  mode: 'channel' | 'dm'
  contextId: string
  serverId: string | null
  threadParentId: string | null
  messageId: string | null
}

export interface InboxHighlight {
  messageId: string
  authorName: string
  snippet: string
  kind: 'mention' | 'reply' | 'thread_reply' | 'message'
  createdAt: string
}

export interface InboxGroup {
  unavailable?: boolean
  key: string
  target: InboxTarget
  name: string
  serverName: string | null
  unreadCount: number
  mentionCount: number
  replyCount: number
  latestAt: string
  highlights: InboxHighlight[]
  savedAt: string | null
}

export interface InboxPage {
  groups: InboxGroup[]
  counts: Record<InboxView, number>
  snapshotAt: string
  nextCursor?: string
}

export interface InboxSession {
  id: string
  revision: number
  view: InboxView
  snapshotAt: string
  groups: InboxGroup[]
  index: number
  completed: number
  deferred: number
  anchor: InboxTarget | null
}

export interface InboxSessionResult {
  session: InboxSession | null
}
