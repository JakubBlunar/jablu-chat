import { useEffect, useRef } from 'react'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'pointerdown'
]

const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function isInVoiceChannel(): boolean {
  return !!useVoiceConnectionStore.getState().room
}

export function useIdleDetector(onIdle: () => void, onActive: () => void) {
  const isIdle = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const goIdle = () => {
      if (!isIdle.current && !isInVoiceChannel()) {
        isIdle.current = true
        onIdle()
      }
    }

    const resetTimer = () => {
      if (timer.current) clearTimeout(timer.current)

      if (isIdle.current) {
        isIdle.current = false
        onActive()
      }

      timer.current = setTimeout(goIdle, IDLE_TIMEOUT_MS)
    }

    resetTimer()

    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, resetTimer, { passive: true })
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timer.current) clearTimeout(timer.current)
      } else {
        resetTimer()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      for (const evt of ACTIVITY_EVENTS) {
        document.removeEventListener(evt, resetTimer)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [onIdle, onActive])
}
