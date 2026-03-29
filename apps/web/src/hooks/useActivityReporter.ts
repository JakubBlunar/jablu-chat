import { useEffect, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth.store'

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

    const sendHeartbeat = () => {
      if (useAuthStore.getState().isManualStatus) return
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
