import i18n from 'i18next'
import { showNotification } from '@/lib/notifications'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useDmStore } from '@/stores/dm.store'

export type ReactionNotification = {
  authorName: string
  emoji: string
  isCustom: boolean
  snippet?: string
  url: string
  channelId?: string
  serverId?: string
  conversationId?: string
}

/** Personal user-room delivery works even when the original message isn't cached. */
export function onReactionNotification(payload: ReactionNotification) {
  if (payload.channelId && useNotifPrefStore.getState().getEffective(payload.channelId, payload.serverId) === 'none') return
  if (payload.conversationId && useDmStore.getState().conversations.find((c) => c.id === payload.conversationId)?.muted) return
  showNotification(
    i18n.t('nav:notificationReaction', {
      author: payload.authorName,
      emoji: payload.isCustom ? `:${payload.emoji}:` : payload.emoji
    }),
    payload.snippet ?? '',
    payload.url
  )
}
