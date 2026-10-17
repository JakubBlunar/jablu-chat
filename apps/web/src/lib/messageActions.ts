import type { Message } from '@chat/shared'
import i18n from 'i18next'
import { getSocket } from '@/lib/socket'
import { useDmStore } from '@/stores/dm.store'
import { useForumReplyStore } from '@/stores/forumReply.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import { useTranslationStore } from '@/stores/translation.store'

interface Acknowledgement {
  ok?: boolean
  error?: string
}

class MessageActionError extends Error {
  readonly reason: 'offline' | 'unconfirmed' | 'rejected'

  constructor(reason: 'offline' | 'unconfirmed' | 'rejected', detail?: string) {
    super(detail ?? reason)
    this.reason = reason
  }
}

export async function requestMessageAction<T extends Acknowledgement = Acknowledgement>(
  event: string,
  payload: Record<string, unknown>
): Promise<T> {
  const socket = getSocket()
  if (!socket?.connected) throw new MessageActionError('offline')
  let response: T
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

export function messageActionError(error: unknown): string {
  if (error instanceof MessageActionError) {
    if (error.reason === 'rejected' && error.message !== 'rejected') return error.message
    return i18n.t(`chat:messageAction_${error.reason}`)
  }
  return i18n.t('chat:messageActionFailed')
}

export async function editMessage(mode: 'channel' | 'dm', contextId: string, messageId: string, content: string) {
  const response = await requestMessageAction<Acknowledgement & { message?: Message }>(
    mode === 'dm' ? 'dm:edit' : 'message:edit',
    { messageId, content, ...(mode === 'dm' ? { conversationId: contextId } : {}) }
  )
  if (!response.message || response.message.id !== messageId) throw new MessageActionError('unconfirmed')
  useTranslationStore.getState().invalidate(messageId)
  if (mode === 'dm') {
    useDmStore.getState().updateMessage(response.message)
  } else {
    useMessageStore.getState().updateMessage(response.message)
    useThreadStore.getState().updateMessage(response.message)
    useForumReplyStore.getState().updateMessage(response.message)
  }
}

export async function deleteMessage(mode: 'channel' | 'dm', contextId: string, message: Message) {
  await requestMessageAction(mode === 'dm' ? 'dm:delete' : 'message:delete', {
    messageId: message.id,
    ...(mode === 'dm' ? { conversationId: contextId } : {})
  })
  useTranslationStore.getState().invalidate(message.id)
  if (mode === 'dm') {
    useDmStore.getState().removeMessage(message.id)
  } else {
    useMessageStore.getState().removeMessage(message.id)
    useThreadStore.getState().deleteMessage(message.id)
    useForumReplyStore.getState().removeMessage(message.id)
    if (message.threadParentId) {
      window.dispatchEvent(new CustomEvent('forum-reply:delete', { detail: message.id }))
    }
  }
}
