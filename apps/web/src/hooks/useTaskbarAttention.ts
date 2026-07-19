import { useEffect } from 'react'
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window'
import { isDesktop } from '@/lib/desktop'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'

/**
 * Desktop-only: flashes/highlights the app in the Windows taskbar (like Docker)
 * when a new inbox notification arrives while the window is unfocused, and
 * clears the highlight as soon as the window regains focus.
 */
export function useTaskbarAttention() {
  useEffect(() => {
    if (!isDesktop) return

    const win = getCurrentWindow()
    let prevCount = useNotificationCenterStore.getState().unreadCount
    let attentionActive = false

    const clearAttention = () => {
      if (!attentionActive) return
      attentionActive = false
      win.requestUserAttention(null).catch(() => {})
    }

    const unsubStore = useNotificationCenterStore.subscribe((state) => {
      const count = state.unreadCount
      if (count > prevCount) {
        void win
          .isFocused()
          .then((focused) => {
            if (!focused) {
              attentionActive = true
              return win.requestUserAttention(UserAttentionType.Critical)
            }
          })
          .catch(() => {})
      }
      prevCount = count
    })

    let unlistenFocus: (() => void) | undefined
    void win
      .onFocusChanged(({ payload: focused }) => {
        if (focused) clearAttention()
      })
      .then((un) => {
        unlistenFocus = un
      })
      .catch(() => {})

    return () => {
      unsubStore()
      unlistenFocus?.()
      clearAttention()
    }
  }, [])
}
