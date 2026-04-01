export type ChannelType = 'text' | 'voice' | 'forum'

export type ForumSortOrder = 'latest_activity' | 'newest'
export type ForumLayout = 'list' | 'grid'

export interface Channel {
  id: string
  serverId: string
  categoryId?: string | null
  name: string
  type: ChannelType
  position: number
  isArchived?: boolean
  defaultSortOrder?: ForumSortOrder
  defaultLayout?: ForumLayout
  postGuidelines?: string | null
  requireTags?: boolean
  createdAt: string
  pinnedCount?: number
}

export interface ForumTag {
  id: string
  channelId: string
  name: string
  color?: string | null
  position: number
  createdAt: string
}

export interface ForumPost {
  id: string
  channelId: string
  authorId: string | null
  title: string | null
  content: string | null
  isLocked: boolean
  createdAt: string
  editedAt: string | null
  author: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null
  attachments: unknown[]
  tags: ForumTag[]
  reactions: { emoji: string; count: number; userIds: string[]; isCustom: boolean }[]
  replyCount: number
  lastActivityAt: string
  linkPreviews?: unknown[]
}

export interface ChannelCategory {
  id: string
  serverId: string
  name: string
  position: number
  createdAt: string
}
