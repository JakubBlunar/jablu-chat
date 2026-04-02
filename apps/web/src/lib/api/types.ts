export type GifResult = {
  id: string
  title: string
  url: string
  preview: string
  width: number
  height: number
}

export type GifSearchResult = {
  results: GifResult[]
  next: string
}

export type SearchResult = {
  id: string
  content: string | null
  title?: string | null
  threadParentId?: string | null
  authorId: string | null
  author: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  channelId: string | null
  channel: { id: string; name: string; serverId: string; type?: string } | null
  dmConversationId: string | null
  createdAt: string
}

export type AuditLogEntry = {
  id: string
  serverId: string
  actorId: string
  action: string
  targetType: string | null
  targetId: string | null
  details: string | null
  createdAt: string
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null
}

export type AutoModRule = {
  id: string | null
  type: 'word_filter' | 'link_filter' | 'spam_detection'
  enabled: boolean
  config: Record<string, unknown>
}

export type CustomEmoji = {
  id: string
  serverId: string
  name: string
  imageUrl: string
  uploadedById: string | null
  createdAt: string
}

export type EmojiStat = {
  emoji: string
  usageCount: number
  lastUsed: string | null
  imageUrl: string | null
  createdAt: string | null
}

export type DmConversation = {
  id: string
  isGroup: boolean
  groupName: string | null
  createdAt: string
  members: {
    userId: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    bio: string | null
    status: string
    createdAt: string
    isBot?: boolean
  }[]
  lastMessage?: {
    content: string | null
    authorId: string
    createdAt: string
  } | null
}

export type OnboardingConfig = {
  onboardingEnabled: boolean
  onboardingMessage: string | null
  roles: {
    id: string
    name: string
    color: string | null
    isDefault: boolean
    selfAssignable: boolean
    position: number
  }[]
}

export type ServerInsights = {
  overview: {
    totalMembers: number
    totalChannels: number
    totalMessages: number
    textChannels: number
    voiceChannels: number
  }
  messagesByDay: { day: string; count: number }[]
  topChannels: { channelId: string; name: string; count: number }[]
  topContributors: {
    userId: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    count: number
  }[]
  membersByWeek: { week: string; count: number }[]
}

export type ActiveSession = {
  id: string
  userAgent: string | null
  ipAddress: string | null
  lastUsedAt: string | null
  createdAt: string
}
