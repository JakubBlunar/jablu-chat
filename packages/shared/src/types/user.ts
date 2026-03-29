export type DmPrivacy = 'everyone' | 'friends_only'

export interface User {
  id: string
  username: string
  displayName: string | null
  email: string
  avatarUrl: string | null
  bio: string | null
  status: UserStatus
  customStatus: string | null
  dmPrivacy: DmPrivacy
  lastSeenAt: string | null
  createdAt: string
}

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline'

export interface UserProfile extends User {
  memberSince?: string
  role?: ServerRole
}

export type ServerRole = 'owner' | 'admin' | 'member'
