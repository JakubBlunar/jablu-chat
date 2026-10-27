/** Version 1 is negotiated by the socket handshake; legacy clients keep full events. */
export type MessageActivity = {
  mode: 'channel' | 'dm'
  contextId: string
  event: string
  isMention?: boolean
  message?: {
    id: string
    authorId: string | null
    createdAt: string
    serverId?: string
    threadParentId: string | null
    /** Plain notification preview, never a history row. */
    content: string | null
    author?: { username: string; displayName: string | null }
    attachments: { type: string; filename: string }[]
  }
}
