export type EventLocationType = 'voice_channel' | 'custom'
export type EventStatus = 'scheduled' | 'active' | 'completed' | 'cancelled'
export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface ServerEvent {
  id: string
  serverId: string
  creatorId: string
  name: string
  description: string | null
  locationType: EventLocationType
  channelId: string | null
  channelName?: string | null
  locationText: string | null
  startAt: string
  endAt: string | null
  status: EventStatus
  recurrenceRule: RecurrenceRule | null
  interestedCount: number
  isInterested?: boolean
  createdAt: string
  creator?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
}
