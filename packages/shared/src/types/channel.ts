export type ChannelType = 'text' | 'voice'

export interface Channel {
  id: string
  serverId: string
  categoryId?: string | null
  name: string
  type: ChannelType
  position: number
  isArchived?: boolean
  createdAt: string
  pinnedCount?: number
}

export interface ChannelCategory {
  id: string
  serverId: string
  name: string
  position: number
  createdAt: string
}
