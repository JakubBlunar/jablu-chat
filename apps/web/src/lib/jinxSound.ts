import type { Message } from '@chat/shared'
import { groupMessages } from './messageGrouping'
import { isAppFocused } from './appVisibility'
import { playJinxSound } from './sounds'
import { useAuthStore } from '@/stores/auth.store'
import { getNotifSettings, notificationsInDnd } from './notifications'

/** Called only by live socket handlers, never API/cache hydration or edits. */
export function playJinxForNewMessage(before: Message[], after: Message[], incoming: Message) {
  const settings = getNotifSettings()
  if (
    !settings.enabled ||
    !settings.soundEnabled ||
    notificationsInDnd() ||
    !isAppFocused() ||
    before.some((m) => m.id === incoming.id) ||
    !after.some((m) => m.id === incoming.id)
  )
    return
  const age = Date.now() - Date.parse(incoming.createdAt)
  if (!Number.isFinite(age) || age < -5000 || age > 15_000) return
  const group = groupMessages(after).find((g) => g.some((m) => m.id === incoming.id))
  const userId = useAuthStore.getState().user?.id
  if (!group || group.length < 2 || !userId || !group.some((message) => message.authorId === userId)) return
  playJinxSound()
}
