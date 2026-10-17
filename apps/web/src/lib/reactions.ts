import type { Message } from '@chat/shared'
import { getSocket } from '@/lib/socket'
import { requestMessageAction, messageActionError } from '@/lib/messageActions'
import i18n from 'i18next'
import { showToast } from '@/stores/toast.store'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useForumReplyStore } from '@/stores/forumReply.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'

type ReactionAction = 'added' | 'removed'

/** Minimal shape shared by every store that holds reactable messages. */
type ReactionStore = {
  getState: () => {
    messages: Message[]
    addReaction: (messageId: string, emoji: string, userId: string, isCustom?: boolean) => void
    removeReaction: (messageId: string, emoji: string, userId: string) => void
  }
}

// Channel-family surfaces (main channel, thread replies, forum replies) all render
// via mode="channel" but keep their messages in different stores. A message lives
// in exactly one of these, and the store ops are guarded no-ops when it's absent,
// so we can safely apply to all of them.
const CHANNEL_STORES: ReactionStore[] = [useMessageStore, useThreadStore, useForumReplyStore]
const pending = new Set<string>()

/**
 * Toggle a reaction with an optimistic local update, reconciled by the socket
 * ack. The server echoes `reaction:add`/`reaction:remove` to the room (including
 * us), but that echo can be missed by the sender (room re-join races, transient
 * disconnects), leaving our own reaction invisible until refresh. Applying the
 * change locally makes it instant; the store ops are idempotent, so the later
 * echo is a no-op, and the ack reverts if the server disagreed (e.g. denied).
 */
export async function toggleMessageReaction(params: {
  mode: 'channel' | 'dm'
  messageId: string
  emoji: string
  isCustom?: boolean
}): Promise<boolean> {
  const { mode, messageId, emoji, isCustom = false } = params
  const socket = getSocket()
  const userId = useAuthStore.getState().user?.id
  if (!socket?.connected || !userId) {
    showToast(i18n.t('chat:actionAddReaction'), i18n.t('chat:messageAction_offline'))
    return false
  }
  const key = JSON.stringify([userId, mode, messageId, emoji])
  if (pending.has(key)) return false
  pending.add(key)
  const stores: ReactionStore[] = mode === 'dm' ? [useDmStore] : CHANNEL_STORES

  const apply = (action: ReactionAction) => {
    if (useAuthStore.getState().user?.id !== userId) return
    for (const store of stores) {
      if (action === 'added') store.getState().addReaction(messageId, emoji, userId, isCustom)
      else store.getState().removeReaction(messageId, emoji, userId)
    }
  }

  const msg = stores
    .map((store) => store.getState().messages.find((m) => m.id === messageId))
    .find((m): m is Message => !!m)
  const alreadyReacted = !!msg?.reactions?.some(
    (r) => r.emoji === emoji && (userId ? r.userIds.includes(userId) : false)
  )
  const predicted: ReactionAction = alreadyReacted ? 'removed' : 'added'
  const opposite: ReactionAction = predicted === 'added' ? 'removed' : 'added'

  apply(predicted)
  let confirmed: ReactionAction | undefined
  const observe = (action: ReactionAction) => (payload: { messageId: string; emoji: string; userId: string }) => {
    if (payload.messageId === messageId && payload.emoji === emoji && payload.userId === userId) confirmed = action
  }
  const onAdd = observe('added')
  const onRemove = observe('removed')
  socket.on('reaction:add', onAdd)
  socket.on('reaction:remove', onRemove)
  try {
    const response = await requestMessageAction<{ ok?: boolean; action?: ReactionAction }>('reaction:toggle', {
      messageId,
      emoji,
      isCustom
    })
    apply(confirmed ?? response.action ?? predicted)
    return true
  } catch (error) {
    // An own-user broadcast is also confirmation; don't undo it if only the ack was lost.
    if (confirmed) {
      apply(confirmed)
      return true
    }
    apply(opposite)
    console.error('Could not update reaction', error)
    showToast(i18n.t('chat:actionAddReaction'), messageActionError(error))
    return false
  } finally {
    pending.delete(key)
    socket.off('reaction:add', onAdd)
    socket.off('reaction:remove', onRemove)
  }
}
