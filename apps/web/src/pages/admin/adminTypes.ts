export type AdminServer = {
  id: string
  name: string
  iconUrl: string | null
  ownerId: string
  createdAt: string
  owner: { id: string; username: string }
  _count: { members: number; channels: number }
}

export type AdminUser = {
  id: string
  username: string
  displayName: string | null
  email: string
  bio: string | null
  avatarUrl: string | null
  status: string
  createdAt: string
  _count: { serverMemberships: number; messages: number }
}

export type AdminInvite = {
  id: string
  code: string
  email: string
  used: boolean
  usedAt: string | null
  expiresAt: string | null
  createdAt: string
  server: { id: string; name: string } | null
  usedBy: { id: string; username: string } | null
}

export type StorageAudit = {
  id: string
  status: string
  totalSizeBytes: string
  limitBytes: string
  orphanedCount: number
  orphanedBytes: string
  attachmentCount: number
  attachmentBytes: string
  messageCount: number
  messageBytes: string
  diskOrphanCount: number
  diskOrphanBytes: string
  totalFreeable: string
  executedAt: string | null
  freedBytes: string | null
  createdAt: string
}

export type StorageStats = {
  dirSize: {
    avatars: number
    attachments: number
    thumbnails: number
    other: number
    total: number
  }
  limitBytes: number
  attachmentCount: number
  messageCount: number
  orphanedAttachments: number
}

export type Tab = 'servers' | 'users' | 'invites' | 'audit' | 'stats' | 'moderation' | 'webhooks' | 'storage' | 'push' | 'deleted'

export type AdminMessage = {
  id: string
  content: string | null
  createdAt: string
  author: { id: string; username: string; displayName: string | null } | null
  channel: {
    id: string
    name: string
    server: { id: string; name: string } | null
  } | null
}

export type AdminWebhook = {
  id: string
  name: string
  token: string
  avatarUrl: string | null
  createdAt: string
  channel: {
    id: string
    name: string
    server: { id: string; name: string } | null
  }
  createdBy: { id: string; username: string } | null
}

export type StatsData = {
  days: number
  totalMessages: number
  recentMessages: number
  totalUsers: number
  totalServers: number
  topChannels: {
    channelId: string
    name: string
    serverName: string
    count: number
  }[]
  topUsers: {
    userId: string
    username: string
    displayName: string | null
    count: number
  }[]
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
  actor: { id: string; username: string; displayName: string | null }
  server: { id: string; name: string }
}

export type UserSession = {
  id: string
  userAgent: string | null
  ipAddress: string | null
  lastUsedAt: string | null
  createdAt: string
}

export type ServerMemberRow = {
  userId: string
  serverId: string
  roleIds: string[]
  roles?: { role: AdminRole }[]
  joinedAt: string
  user: { id: string; username: string; email: string; avatarUrl: string | null }
}

export type AdminRole = {
  id: string
  serverId: string
  name: string
  color: string | null
  position: number
  permissions: string
  isDefault: boolean
  selfAssignable: boolean
  isAdmin: boolean
  createdAt: string
}

export type DeletedStats = {
  messageCount: number
  attachmentCount: number
  totalSizeBytes: number
}

export type PurgeResult = {
  purgedMessages: number
  purgedAttachments: number
  freedBytes: number
}
