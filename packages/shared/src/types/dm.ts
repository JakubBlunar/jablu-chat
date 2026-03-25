export interface DirectConversation {
  id: string
  isGroup: boolean
  groupName: string | null
  createdAt: string
  members?: DirectConversationMemberInfo[]
  lastMessage?: {
    content: string
    authorId: string
    createdAt: string
  } | null
}

export interface DirectConversationMemberInfo {
  userId: string
  username: string
  avatarUrl: string | null
  status: string
}
