export type MessageDeletePayload = {
  messageId: string
  channelId: string
}

export type TypingPayload = {
  userId: string
  channelId: string
  username: string
}

export type OnlinePayload = {
  userId: string
}

export type StatusPayload = {
  userId: string
  status: string
}

export type ReactionPayload = {
  messageId: string
  emoji: string
  userId: string
  isCustom: boolean
  conversationId?: string
}

export type LinkPreviewPayload = {
  messageId: string
  linkPreviews: import('@chat/shared').LinkPreview[]
}

export type DmMessagePayload = import('@chat/shared').Message & { conversationId: string }
export type DmDeletePayload = { messageId: string; conversationId: string }
export type DmTypingPayload = {
  userId: string
  conversationId: string
  username: string
}
export type DmLinkPreviewPayload = LinkPreviewPayload & { conversationId: string }

export type ThrottledAck = (fn: () => void) => void
