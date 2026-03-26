import type { UserStatus } from './user.js'

export type FriendshipStatus = 'pending' | 'accepted'

export interface Friend {
  friendshipId: string
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  status: UserStatus
  since: string
}

export interface FriendRequest {
  friendshipId: string
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: UserStatus
  }
  direction: 'incoming' | 'outgoing'
  createdAt: string
}

export interface FriendshipStatusResponse {
  status: 'none' | 'pending_incoming' | 'pending_outgoing' | 'friends'
  friendshipId: string | null
}
