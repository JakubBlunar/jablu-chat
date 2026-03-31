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
  createdAt: string
  roles?: Role[]
}

export interface ServerMember {
  userId: string
  serverId: string
  roleId: string
  joinedAt: string
  onboardingCompleted?: boolean
  role?: Role
  user?: {
    id: string
    username: string
    avatarUrl: string | null
    status: string
  }
}
