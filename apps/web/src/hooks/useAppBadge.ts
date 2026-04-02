import { useEffect } from 'react'
import { computeTotalBadge } from '@/lib/unread'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'

const BASE_TITLE = 'Jablu'

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
    const recalc = () => updateBadge(computeTotalBadge())
    recalc()
    const unsubs = [
      useReadStateStore.subscribe(recalc),
      useServerStore.subscribe(recalc),
      useChannelStore.subscribe(recalc),
      useDmStore.subscribe(recalc),
      useNotifPrefStore.subscribe(recalc),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])
}
