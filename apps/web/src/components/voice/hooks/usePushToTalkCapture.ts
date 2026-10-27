import { getMicMode, getPttBinding, setPttBinding as savePttBinding, type PttBinding } from '@/lib/micMode'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useCallback, useEffect, useRef, useState } from 'react'
export function usePushToTalkCapture() {
  const [pttBinding, setPttBinding] = useState<PttBinding>(getPttBinding)
  const [recordingPtt, setRecordingPtt] = useState(false)
  const pttCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    return () => {
      pttCleanupRef.current?.()
      pttCleanupRef.current = null
    }
  }, [])
  const handlePttRecord = useCallback(() => {
    setRecordingPtt(true)

    const finish = (binding: PttBinding) => {
      setPttBinding(binding)
      savePttBinding(binding)
      setRecordingPtt(false)
      cleanup()
      if (getMicMode() === 'push-to-talk') {
        useVoiceConnectionStore.getState().setMicMode('push-to-talk')
      }
    }

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingPtt(false)
        cleanup()
        return
      }
      finish({ type: 'key', key: e.key })
    }

    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      finish({ type: 'mouse', button: e.button })
    }

    const onContext = (e: Event) => e.preventDefault()

    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('contextmenu', onContext, true)
      pttCleanupRef.current = null
    }

    pttCleanupRef.current?.()
    pttCleanupRef.current = cleanup

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('contextmenu', onContext, true)
  }, [])
  return { pttBinding, recordingPtt, handlePttRecord }
}
