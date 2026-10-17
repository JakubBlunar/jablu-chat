import { useTranslation } from 'react-i18next'
import type { DmConversation } from '@/lib/api'
import { formatSmartTimestamp } from '@/lib/format-time'
import { useActivityStore } from '@/stores/activity.store'
import { ActivityLine } from '@/components/user/ActivityLine'

export function ConversationPreview({ conversation, currentUserId }: { conversation: DmConversation; currentUserId?: string }) {
  const { t } = useTranslation('chat')
  const otherId = !conversation.isGroup ? conversation.members.find((member) => member.userId !== currentUserId)?.userId : undefined
  const activity = useActivityStore((state) => otherId ? state.activities.get(otherId) : undefined)
  const message = conversation.lastMessage
  if (!message && !activity) return null
  const sender = message?.authorId === currentUserId
    ? t('conversationYou')
    : message?.authorName ?? conversation.members.find((member) => member.userId === message?.authorId)?.displayName ??
      conversation.members.find((member) => member.userId === message?.authorId)?.username ?? t('deletedUser')
  const prefix = message && (conversation.isGroup || message.authorId === currentUserId) ? `${sender}: ` : ''
  const preview = message?.content || (message?.attachment
    ? message.attachment.type === 'file' ? message.attachment.filename : t(`conversationAttachment_${message.attachment.type}`)
    : t('conversationAttachment'))
  return (
    <>
      {activity ? <ActivityLine activity={activity} /> : <p className="truncate text-xs font-normal text-gray-400">{prefix}{preview}</p>}
      {message && <time dateTime={message.createdAt} className="block text-[10px] font-normal text-gray-500">{formatSmartTimestamp(message.createdAt)}</time>}
    </>
  )
}
