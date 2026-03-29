export interface Message {
  id: string
  channelId: string | null
  directConversationId: string | null
  authorId: string | null
  replyToId: string | null
  threadParentId: string | null
  webhookId: string | null
  content: string | null
  pinned: boolean
  createdAt: string
  editedAt: string | null
  author?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl: string | null
  } | null
  attachments?: Attachment[]
  reactions?: ReactionGroup[]
  replyTo?: MessagePreview | null
  linkPreviews?: LinkPreview[]
  threadCount?: number
  webhook?: { name: string; avatarUrl: string | null } | null
  poll?: import('./poll.js').Poll | null
}

export interface MessagePreview {
  id: string
  content: string
  author: {
    id: string
    username: string
    displayName?: string | null
  } | null
}

export interface Attachment {
  id: string
  messageId: string | null
  filename: string
  url: string
  type: AttachmentType
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  thumbnailUrl?: string | null
}

export type AttachmentType = 'image' | 'video' | 'gif' | 'file'

export interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
  isCustom: boolean
}

export interface LinkPreview {
  id: string
  url: string
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
}
