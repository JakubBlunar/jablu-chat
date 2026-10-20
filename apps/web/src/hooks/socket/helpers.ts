import { messagePreviewText, type Message } from '@chat/shared'
import i18n from 'i18next'

export function describeAttachments(msg: Message): string {
  const attachments = msg.attachments
  if (!attachments || attachments.length === 0) return i18n.t('chat:notificationAttachments.empty')
  const first = attachments[0]
  const type = first.type === 'image' || first.type === 'video' || first.type === 'gif' ? first.type : 'file'
  if (attachments.length === 1) return i18n.t(`chat:notificationAttachments.${type}`)
  return i18n.t('chat:notificationAttachments.multiple', { count: attachments.length })
}

export function notifBody(msg: Message): string {
  const preview = messagePreviewText(msg.content)
  if (preview) return preview
  return describeAttachments(msg)
}
