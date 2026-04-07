import type { Room } from 'livekit-client'
import { Track } from 'livekit-client'
import { canUseRnnoise } from '@/lib/noiseReductionCapabilities'
import { buildAudioCaptureOptions, buildAudioCaptureOptionsForMode } from '@/lib/voiceAudioCaptureOptions'
import { getNoiseReductionMode } from '@/lib/voiceProcessingSettings'
import { startRnnoiseMicrophone, stopRnnoiseMicrophone } from '@/lib/rnnoiseMicrophone'

function showVoiceError(message: string) {
  window.dispatchEvent(new CustomEvent('voice:error', { detail: { message } }))
}

/**
 * Rebuilds the mic capture path from saved settings.
 * @param micShouldBeLive - if false (user is muted), only updates `room.options` and tears down any publication; unmute will recreate using new defaults.
 */
export async function restartMicrophonePipeline(
  room: Room,
  audioInputDeviceId: string | undefined,
  micShouldBeLive: boolean
): Promise<void> {
  await stopRnnoiseMicrophone(room)

  const existing = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  if (existing?.track) {
    try {
      await room.localParticipant.unpublishTrack(existing.track)
    } catch {
      /* ignore */
    }
  }

  await room.localParticipant.setMicrophoneEnabled(false).catch(() => {})

  const mode = getNoiseReductionMode()
  const opts = buildAudioCaptureOptions(audioInputDeviceId)
  room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...opts }

  if (!micShouldBeLive) {
    return
  }

  if (mode === 'rnnoise' && canUseRnnoise()) {
    try {
      await startRnnoiseMicrophone(room, opts)
    } catch {
      showVoiceError('RNNoise failed to start. Using standard microphone for this session.')
      const fallback = buildAudioCaptureOptionsForMode('standard', audioInputDeviceId)
      room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...fallback }
      await room.localParticipant.setMicrophoneEnabled(true, fallback)
    }
  } else {
    if (mode === 'rnnoise' && !canUseRnnoise()) {
      showVoiceError('RNNoise needs AudioWorklet support. Using standard microphone.')
    }
    await room.localParticipant.setMicrophoneEnabled(true, opts)
  }
}
