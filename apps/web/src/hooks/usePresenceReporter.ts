import { useEffect } from 'react'
import type { Socket } from 'socket.io-client'
import { getAppVisibilityState, subscribeAppVisibility } from '@/lib/appVisibility'

/**
 * Tells the server whether this session is on screen, which is what decides
 * whether push goes to the user's other devices. Without it the server assumes
 * hidden and pushes, so a dropped report costs a redundant notification rather
 * than a missed one.
 */
export function usePresenceReporter(socket: Socket | null) {
  useEffect(() => {
    if (!socket) return

    const report = () => {
      const { visibility, focused } = getAppVisibilityState()
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
