import { useEffect } from 'react'
import type { Socket } from 'socket.io-client'
import { getAppVisibilityState, subscribeAppVisibility } from '@/lib/appVisibility'
import { clearNotifications } from '@/lib/notifications'

/**
 * Tells the server whether this session is on screen, which is what decides
 * whether push goes to the user's other devices. Without it the server assumes
 * hidden and pushes, so a dropped report costs a redundant notification rather
 * than a missed one.
 */
export function usePresenceReporter(socket: Socket | null) {
  useEffect(() => {
    if (!socket) return

    let wasFocused = getAppVisibilityState().focused

    const report = () => {
      const { visibility, focused } = getAppVisibilityState()

      // Coming back to the app makes every pending OS toast redundant — whatever
      // they were about is now on screen. The per-item `notification:clear`
      // events only cover things read on *another* device.
      if (focused && !wasFocused) void clearNotifications(null)
      wasFocused = focused

      if (!socket.connected) return
      socket.emit('presence:state', { visibility, focused })
    }

    // Re-send on every (re)connect: the server drops session state on disconnect.
    socket.on('connect', report)
    const unsubscribe = subscribeAppVisibility(report)
    report()

    return () => {
      socket.off('connect', report)
      unsubscribe()
    }
  }, [socket])
}
