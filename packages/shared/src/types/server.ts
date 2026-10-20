import type { Role } from './permissions.js'

export interface Server {
  id: string
  name: string
  iconUrl: string | null
  ownerId: string
  vanityCode?: string | null
  welcomeChannelId?: string | null
  welcomeMessage?: string | null
  afkChannelId?: string | null
  afkTimeout?: number
  onboardingEnabled?: boolean
  onboardingMessage?: string | null
  xpEnabled?: boolean
  createdAt: string
  roles?: Role[]
}

export interface ServerMember {
  userId: string
  serverId: string
  displayName?: string | null
  bio?: string | null
  roleIds: string[]
  joinedAt: string
  onboardingCompleted?: boolean
  roles?: Role[]
  user?: {
    id: string
    username: string
    avatarUrl: string | null
    status: string
  }
}

export interface ServerProfile {
  displayName: string | null
  bio: string | null
}

export type ServerLayoutEntry =
  | { type: 'server'; serverId: string }
  | { type: 'folder'; id: string; name: string; collapsed: boolean; serverIds: string[] }
