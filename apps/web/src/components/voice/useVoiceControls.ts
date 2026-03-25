import { useCallback, useEffect, useState } from 'react'
import type { CameraQuality } from '@/lib/deviceSettings'
import type { ScreenShareSettings } from './ScreenShareDialog'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { getSocket } from '@/lib/socket'
import { playLeaveSound } from '@/lib/sounds'

export function useVoiceControls() {
  const isMuted = useVoiceConnectionStore((s) => s.isMuted)
  const isDeafened = useVoiceConnectionStore((s) => s.isDeafened)
  const isCameraOn = useVoiceConnectionStore((s) => s.isCameraOn)
  const isScreenSharing = useVoiceConnectionStore((s) => s.isScreenSharing)
  const toggleMute = useVoiceConnectionStore((s) => s.toggleMute)
  const toggleDeafen = useVoiceConnectionStore((s) => s.toggleDeafen)
  const startCamera = useVoiceConnectionStore((s) => s.startCamera)
  const stopCamera = useVoiceConnectionStore((s) => s.stopCamera)
  const applyCameraSettings = useVoiceConnectionStore((s) => s.applyCameraSettings)
  const disconnect = useVoiceConnectionStore((s) => s.disconnect)
  const connectedAt = useVoiceConnectionStore((s) => s.connectedAt)

  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cameraModalMode, setCameraModalMode] = useState<'start' | 'edit' | null>(null)
  const [showScreenShareDialog, setShowScreenShareDialog] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail.message
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 5000)
    }
    window.addEventListener('voice:error', handler)
    return () => window.removeEventListener('voice:error', handler)
  }, [])

  useEffect(() => {
    if (!connectedAt) {
      setElapsed(0)
      return
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - connectedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [connectedAt])

  const handleCameraClick = useCallback(() => {
    if (isCameraOn) {
      stopCamera()
    } else {
      setCameraModalMode('start')
    }
  }, [isCameraOn, stopCamera])

  const handleCameraConfirm = useCallback(
    (quality: CameraQuality, blur: boolean) => {
      if (cameraModalMode === 'start') {
        startCamera(quality, blur)
      } else {
        applyCameraSettings(quality, blur)
      }
      setCameraModalMode(null)
    },
    [cameraModalMode, startCamera, applyCameraSettings]
  )

  const handleDisconnect = useCallback(() => {
    playLeaveSound()
    getSocket()?.emit('voice:leave')
    disconnect()
  }, [disconnect])

  const handleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      const room = useVoiceConnectionStore.getState().room
      room?.localParticipant.setScreenShareEnabled(false).catch(() => {})
      useVoiceConnectionStore.getState().setScreenSharing(false)
    } else {
      setShowScreenShareDialog(true)
    }
  }, [isScreenSharing])

  const handleScreenShareConfirm = useCallback((settings: ScreenShareSettings) => {
    setShowScreenShareDialog(false)
    import('@/components/voice/screenShareUtils').then(({ startScreenShareWithSettings }) =>
      startScreenShareWithSettings(settings)
    )
  }, [])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`

  return {
    isMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    elapsed,
    timeStr,
    errorMsg,
    cameraModalMode,
    setCameraModalMode,
    showScreenShareDialog,
    setShowScreenShareDialog,
    handleCameraClick,
    handleCameraConfirm,
    handleDisconnect,
    handleScreenShare,
    handleScreenShareConfirm
  }
}

export const supportsScreenShare =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
