import {
  getSavedAudioInput,
  getSavedCamera,
  getSavedCameraQuality,
  setSavedAudioInput,
  setSavedAudioOutput,
  setSavedCamera
} from '@/lib/deviceSettings'
import { startMicMode, stopMicMode } from '@/lib/micMode'
import { restartMicrophonePipeline } from '@/lib/voiceMicPipelineRestart'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { enqueueMicrophoneOperation } from '@/lib/voiceMicOperations'

export async function changeVoiceDevice(kind: MediaDeviceKind, deviceId: string): Promise<void> {
  const state = useVoiceConnectionStore.getState()
  const { room } = state
  if (kind === 'audioinput') {
    const previous = getSavedAudioInput()
    if (room) {
      await enqueueMicrophoneOperation(room, async () => {
        const isCurrent = () => {
          const current = useVoiceConnectionStore.getState()
          return current.room === room && !current.isMuted && !current.isDeafened
        }
        if (useVoiceConnectionStore.getState().room !== room) return
        await stopMicMode(true)
        try {
          await restartMicrophonePipeline(room, deviceId || 'default', isCurrent(), isCurrent)
        } catch (error) {
          if (useVoiceConnectionStore.getState().room === room)
            await restartMicrophonePipeline(room, previous || 'default', isCurrent(), isCurrent)
          throw error
        } finally {
          const current = useVoiceConnectionStore.getState()
          if (isCurrent() && current.micMode !== 'always') startMicMode(current.micMode)
        }
      })
    }
    setSavedAudioInput(deviceId)
  } else if (kind === 'audiooutput') {
    if (room && !(await room.switchActiveDevice('audiooutput', deviceId || 'default'))) {
      throw new Error('Audio output could not be changed')
    }
    state.setAudioOutputDeviceId(deviceId)
    setSavedAudioOutput(deviceId)
  } else {
    const previous = getSavedCamera()
    setSavedCamera(deviceId)
    if (room && state.isCameraOn) {
      try {
        // Recreate the capture path so blurred video never switches to an unprocessed track.
        await state.stopCamera()
        await state.startCamera(getSavedCameraQuality(), state.isBlurEnabled)
        if (!useVoiceConnectionStore.getState().isCameraOn) throw new Error('Camera could not be changed')
      } catch (error) {
        setSavedCamera(previous)
        throw error
      }
    }
  }
}

export function reportVoiceDeviceError(error: unknown) {
  console.error('Failed to change voice device:', error)
  window.dispatchEvent(
    new CustomEvent('voice:error', {
      detail: { message: 'Could not change device. Check device connections and permissions.' }
    })
  )
}
