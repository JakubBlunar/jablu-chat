import type { Role } from './permissions.js'

export interface Server {
  id: string
  name: string
  iconUrl: string | null
  ownerId: string
  createdAt: string
  roles?: Role[]
}

export interface ServerMember {
  userId: string
  serverId: string
  roleId: string
  joinedAt: string
  role?: Role
  user?: {
    id: string
    username: string
    avatarUrl: string | null
    status: string
  }
}
