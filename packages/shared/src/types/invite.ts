export interface Invite {
  id: string
  serverId: string
  createdById: string
  code: string
  maxUses: number | null
  useCount: number
  expiresAt: string | null
  createdAt: string
  server?: { name: string }
  createdBy?: {
    id: string
    username: string
    avatarUrl: string | null
  }
}
