import { messageNotificationUrl, type InboxTarget } from '@chat/shared'

export function inboxConversationPath(target: InboxTarget): string {
  return target.mode === 'dm' ? `/channels/@me/${target.contextId}` : `/channels/${target.serverId}/${target.contextId}`
}

export function inboxTargetPath(target: InboxTarget): string {
  const path = inboxConversationPath(target)
  return target.messageId ? messageNotificationUrl(path, target.messageId, target.threadParentId) : path
}
