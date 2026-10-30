import { useEffect } from 'react'
import { computeTotalBadge } from '@/lib/unread'
import { desktopAPI, isDesktop } from '@/lib/desktop'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'

const BASE_TITLE = 'Jablu'

function updateBadge(count: number, notificationCount: number) {
  // On desktop the native window title is owned by `useToolbarTitle` (server /
  // channel name), so we don't touch document.title; instead we surface the
  // inbox notification count in the tray and taskbar. Ordinary channel alerts
  // and non-message notifications must contribute, just as they do to flashing.
  if (isDesktop) {
    void desktopAPI?.setTrayUnread(notificationCount).catch((error) => console.error('Failed to update desktop unread badge:', error))
  } else {
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE}` : BASE_TITLE
  }

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
    let previousCount: number | undefined
    let previousNotifications: number | undefined
    const recalc = () => {
      const count = computeTotalBadge()
      const notifications = useNotificationCenterStore.getState().unreadCount
      if (count === previousCount && notifications === previousNotifications) return
      previousCount = count
      previousNotifications = notifications
      updateBadge(count, notifications)
    }
    recalc()
    const unsubs = [
      useReadStateStore.subscribe(recalc),
      useServerStore.subscribe(recalc),
      useChannelStore.subscribe(recalc),
      useDmStore.subscribe(recalc),
      useNotifPrefStore.subscribe(recalc),
      useNotificationCenterStore.subscribe(recalc),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])
}
