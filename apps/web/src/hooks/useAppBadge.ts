import { useEffect } from 'react'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'

const BASE_TITLE = 'Jablu'

function getTotalUnread(): number {
  const { channels, dms } = useReadStateStore.getState()
  const viewMode = useServerStore.getState().viewMode
  const activeChannelId = useChannelStore.getState().currentChannelId
  const activeConvId = useDmStore.getState().currentConversationId

  let total = 0
  for (const [id, rs] of channels) {
    if (viewMode === 'server' && id === activeChannelId) continue
    total += rs.unreadCount
  }
  for (const [id, rs] of dms) {
    if (viewMode === 'dm' && id === activeConvId) continue
    total += rs.unreadCount
  }
  return total
}

function updateBadge(count: number) {
  document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE}` : BASE_TITLE

  if ('setAppBadge' in navigator) {
    if (count > 0) {
      (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> })
        .setAppBadge(count)
        .catch(() => {})
    } else {
      (navigator as Navigator & { clearAppBadge: () => Promise<void> })
        .clearAppBadge()
        .catch(() => {})
    }
  }
}

export function useAppBadge() {
  useEffect(() => {
    const recalc = () => updateBadge(getTotalUnread())
    recalc()
    const unsubs = [
      useReadStateStore.subscribe(recalc),
      useServerStore.subscribe(recalc),
      useChannelStore.subscribe(recalc),
      useDmStore.subscribe(recalc),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])
}
