import type { Message } from '@chat/shared'

export function describeAttachments(msg: Message): string {
  const attachments = msg.attachments
  if (!attachments || attachments.length === 0) return '[attachment]'
  const first = attachments[0]
  const label =
    first.type === 'image' ? 'an image'
    : first.type === 'video' ? 'a video'
    : first.type === 'gif' ? 'a GIF'
    : 'a file'
  if (attachments.length === 1) return `sent ${label}`
  return `sent ${attachments.length} files`
}

export function notifBody(msg: Message): string {
  if (msg.content && msg.content.trim()) return msg.content.slice(0, 100)
  return describeAttachments(msg)
}
