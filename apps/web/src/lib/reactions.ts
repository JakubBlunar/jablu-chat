import type { Message } from '@chat/shared'
import { getSocket } from '@/lib/socket'
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

/**
 * Toggle a reaction with an optimistic local update, reconciled by the socket
 * ack. The server echoes `reaction:add`/`reaction:remove` to the room (including
 * us), but that echo can be missed by the sender (room re-join races, transient
 * disconnects), leaving our own reaction invisible until refresh. Applying the
 * change locally makes it instant; the store ops are idempotent, so the later
 * echo is a no-op, and the ack reverts if the server disagreed (e.g. denied).
 */
export function toggleMessageReaction(params: {
  mode: 'channel' | 'dm'
  messageId: string
  emoji: string
  isCustom?: boolean
}): void {
  const { mode, messageId, emoji, isCustom = false } = params
  const socket = getSocket()
  const userId = useAuthStore.getState().user?.id
  const stores: ReactionStore[] = mode === 'dm' ? [useDmStore] : CHANNEL_STORES

  const apply = (action: ReactionAction) => {
    if (!userId) return
    for (const store of stores) {
      if (action === 'added') store.getState().addReaction(messageId, emoji, userId, isCustom)
      else store.getState().removeReaction(messageId, emoji, userId)
    }
  }

  const msg = stores
    .map((store) => store.getState().messages.find((m) => m.id === messageId))
    .find((m): m is Message => !!m)
  const alreadyReacted = !!msg?.reactions?.some((r) => r.emoji === emoji && (userId ? r.userIds.includes(userId) : false))
  const predicted: ReactionAction = alreadyReacted ? 'removed' : 'added'
  const opposite: ReactionAction = predicted === 'added' ? 'removed' : 'added'

  apply(predicted)

  socket?.emit(
    'reaction:toggle',
    { messageId, emoji, isCustom },
    (res?: { ok?: boolean; action?: ReactionAction }) => {
      // Revert when the server rejected the toggle or resolved it the other way.
      if (!res || res.ok === false || (res.action && res.action !== predicted)) {
        apply(opposite)
      }
    }
  )
}
