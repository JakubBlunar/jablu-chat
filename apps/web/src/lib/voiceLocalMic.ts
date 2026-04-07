import type { Room } from 'livekit-client'
import { Track } from 'livekit-client'
import { getValidatedDevices } from '@/lib/deviceSettings'
import { canUseRnnoise } from '@/lib/noiseReductionCapabilities'
import { startRnnoiseMicrophone } from '@/lib/rnnoiseMicrophone'
import {
  buildAudioCaptureOptions,
  buildAudioCaptureOptionsForMode
} from '@/lib/voiceAudioCaptureOptions'
import { getNoiseReductionMode } from '@/lib/voiceProcessingSettings'

/**
 * Mutes/unmutes the local microphone publication when present; otherwise falls back to LiveKit enable API
 * or RNNoise pipeline when appropriate.
 */
export async function setLocalMicTransmissionEnabled(room: Room, enabled: boolean): Promise<void> {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  const t = pub?.track
  if (t) {
    if (enabled) await t.unmute()
    else await t.mute()
    return
  }
  if (enabled) {
    const { audioInput } = await getValidatedDevices()
    const deviceId = audioInput || undefined
    const mode = getNoiseReductionMode()
    if (mode === 'rnnoise' && canUseRnnoise()) {
      const opts = buildAudioCaptureOptions(deviceId)
      try {
        await startRnnoiseMicrophone(room, opts)
      } catch {
        const fallback = buildAudioCaptureOptionsForMode('standard', deviceId)
        room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...fallback }
        await room.localParticipant.setMicrophoneEnabled(true, fallback)
      }
    } else {
      await room.localParticipant.setMicrophoneEnabled(true, buildAudioCaptureOptions(deviceId))
    }
  } else {
    await room.localParticipant.setMicrophoneEnabled(false)
  }
}
