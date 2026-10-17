import { requestMessageAction } from '@/lib/messageActions'

export async function setMessagePinned(mode: 'channel' | 'dm', contextId: string, messageId: string, pinned: boolean) {
  const action = pinned ? 'pin' : 'unpin'
  await requestMessageAction(mode === 'dm' ? `dm:${action}` : `message:${action}`, {
    messageId,
    ...(mode === 'dm' ? { conversationId: contextId } : { channelId: contextId })
  })
}
