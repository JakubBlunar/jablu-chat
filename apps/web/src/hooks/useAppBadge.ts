import { useEffect } from 'react'
import { useReadStateStore } from '@/stores/readState.store'

const BASE_TITLE = 'Jablu'

function getTotalUnread(): number {
  const { channels, dms } = useReadStateStore.getState()
  let total = 0
  for (const rs of channels.values()) total += rs.unreadCount
  for (const rs of dms.values()) total += rs.unreadCount
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
    updateBadge(getTotalUnread())
    return useReadStateStore.subscribe(() => updateBadge(getTotalUnread()))
  }, [])
}
