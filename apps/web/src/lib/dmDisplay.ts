import type { DmConversation } from '@/lib/api'

export function getDmDisplayInfo(conversation: DmConversation, userId?: string) {
  if (conversation.isGroup) {
    const name =
      conversation.groupName || conversation.members.map((member) => member.displayName ?? member.username).join(', ')
    return { name, avatarUrl: conversation.groupAvatarUrl ?? null }
  }

  const other = conversation.members.find((member) => member.userId !== userId)
  return {
    name: other?.displayName ?? other?.username ?? 'Unknown',
    avatarUrl: other?.avatarUrl ?? null
  }
}

export function compareDmConversations(a: DmConversation, b: DmConversation) {
  return Number(!!b.isFavorite) - Number(!!a.isFavorite) ||
    new Date(b.lastMessage?.createdAt ?? b.createdAt).getTime() - new Date(a.lastMessage?.createdAt ?? a.createdAt).getTime()
}
