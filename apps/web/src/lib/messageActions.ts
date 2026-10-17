import type { Message } from '@chat/shared'
import { requestMessageAction } from '@/lib/messageActionTransport'
import { MessageActionError } from '@/lib/messageActionError'
import { useDmStore } from '@/stores/dm.store'
import { useForumReplyStore } from '@/stores/forumReply.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import { useTranslationStore } from '@/stores/translation.store'

export async function editMessage(mode: 'channel' | 'dm', contextId: string, messageId: string, content: string) {
  const response =
    mode === 'dm'
      ? await requestMessageAction('dm:edit', { messageId, content, conversationId: contextId })
      : await requestMessageAction('message:edit', { messageId, content })
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
  if (mode === 'dm') await requestMessageAction('dm:delete', { messageId: message.id, conversationId: contextId })
  else await requestMessageAction('message:delete', { messageId: message.id })
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
