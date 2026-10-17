import { getSocket } from '@/lib/socket'

export async function setMessagePinned(mode: 'channel' | 'dm', contextId: string, messageId: string, pinned: boolean) {
  const socket = getSocket()
  if (!socket?.connected) throw new Error('No connection for pin update')
  const action = pinned ? 'pin' : 'unpin'
  const response: { ok?: boolean; error?: string } = await socket
    .timeout(10_000)
    .emitWithAck(mode === 'dm' ? `dm:${action}` : `message:${action}`, {
      messageId,
      ...(mode === 'dm' ? { conversationId: contextId } : { channelId: contextId })
    })
  if (!response?.ok) throw new Error(response?.error ?? 'Pin update was not acknowledged')
}
