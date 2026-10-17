import { requestMessageAction } from '@/lib/messageActionTransport'

export async function setMessagePinned(mode: 'channel' | 'dm', contextId: string, messageId: string, pinned: boolean) {
  const action = pinned ? 'pin' : 'unpin'
  if (mode === 'dm') await requestMessageAction(`dm:${action}`, { messageId, conversationId: contextId })
  else await requestMessageAction(`message:${action}`, { messageId, channelId: contextId })
}
