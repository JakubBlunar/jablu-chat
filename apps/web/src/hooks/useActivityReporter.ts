import { useEffect, useRef } from 'react'
import type { Socket } from 'socket.io-client'

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'pointerdown'
]

const HEARTBEAT_THROTTLE_MS = 30_000

export function useActivityReporter(socket: Socket | null) {
  const lastSent = useRef(0)

  useEffect(() => {
    if (!socket) return

    // Sent regardless of manual status. The heartbeat now also drives the push
    // away-timer, and someone on Idle or DND is still at their machine — going
    // quiet here would make the server think they left and start pushing their
    // phone. The server keeps its own manual-status guard for presence effects.
    const sendHeartbeat = () => {
      if (!socket.connected) return
      const now = Date.now()
      if (now - lastSent.current < HEARTBEAT_THROTTLE_MS) return
      lastSent.current = now
      socket.emit('activity:heartbeat')
    }

    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, sendHeartbeat, { passive: true })
    }

    const onVisibilityChange = () => {
      if (!document.hidden) {
        lastSent.current = 0
        sendHeartbeat()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        document.removeEventListener(evt, sendHeartbeat)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [socket])
}
