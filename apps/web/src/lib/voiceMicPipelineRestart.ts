import type { Room } from 'livekit-client'
import { Track, createLocalAudioTrack } from 'livekit-client'
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
  micShouldBeLive: boolean,
  isCurrent: () => boolean = () => true
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

  if (!micShouldBeLive || !isCurrent()) {
    return
  }

  if (mode === 'rnnoise' && canUseRnnoise()) {
    try {
      await startRnnoiseMicrophone(room, opts, isCurrent)
    } catch {
      if (!isCurrent()) return
      showVoiceError('RNNoise failed to start. Using standard microphone for this session.')
      const fallback = buildAudioCaptureOptionsForMode('standard', audioInputDeviceId)
      room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...fallback }
      await publish(fallback)
    }
  } else {
    if (mode === 'rnnoise' && !canUseRnnoise()) {
      showVoiceError('RNNoise needs AudioWorklet support. Using standard microphone.')
    }
    await publish(mode === 'rnnoise' ? buildAudioCaptureOptionsForMode('standard', audioInputDeviceId) : opts)
  }

  async function publish(options: Parameters<typeof createLocalAudioTrack>[0]) {
    const track = await createLocalAudioTrack(options)
    try {
      if (!isCurrent()) {
        track.stop()
        return
      }
      await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone })
      if (!isCurrent()) {
        await room.localParticipant.unpublishTrack(track)
        track.stop()
      }
    } catch (error) {
      track.stop()
      throw error
    }
  }
}
