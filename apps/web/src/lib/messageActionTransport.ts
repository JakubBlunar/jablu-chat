import type { EditMessageInput, Message, SendMessageInput } from '@chat/shared'
import { getSocket } from '@/lib/socket'
import { MessageActionError } from '@/lib/messageActionError'

interface Acknowledgement {
  ok?: boolean
  error?: string
}
interface MessageAcknowledgement extends Acknowledgement {
  message?: Message
}
type MessageId = { messageId: string }
type DmMessageId = MessageId & { conversationId: string }
type ChannelMessageId = MessageId & { channelId: string }

interface MessageActionPayloads {
  'message:edit': MessageId & EditMessageInput
  'dm:edit': DmMessageId & EditMessageInput
  'message:delete': MessageId
  'dm:delete': DmMessageId
  'message:pin': ChannelMessageId
  'message:unpin': ChannelMessageId
  'dm:pin': DmMessageId
  'dm:unpin': DmMessageId
  'reaction:toggle': MessageId & { emoji: string; isCustom?: boolean }
  'message:send': SendMessageInput & {
    channelId: string
    clientMessageId: string
    forwardFromMessageId?: string
    threadParentId?: string
  }
}

type MessageActionResponse<K extends keyof MessageActionPayloads> = K extends
  'message:edit' | 'dm:edit' | 'message:send'
  ? MessageAcknowledgement
  : K extends 'reaction:toggle'
    ? Acknowledgement & { action?: 'added' | 'removed' }
    : Acknowledgement

export async function requestMessageAction<K extends keyof MessageActionPayloads>(
  event: K,
  payload: MessageActionPayloads[K]
): Promise<MessageActionResponse<K>> {
  const socket = getSocket()
  if (!socket?.connected) throw new MessageActionError('offline')
  let response: MessageActionResponse<K>
  try {
    response = await socket.timeout(10_000).emitWithAck(event, payload)
  } catch (error) {
    console.error('Message action acknowledgement failed', event, error)
    throw new MessageActionError('unconfirmed')
  }
  if (!response || typeof response.ok !== 'boolean') throw new MessageActionError('unconfirmed')
  if (!response.ok) throw new MessageActionError('rejected', response.error)
  return response
}
