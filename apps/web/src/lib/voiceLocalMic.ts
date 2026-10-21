import type { Room } from 'livekit-client'
import { Track, createLocalAudioTrack } from 'livekit-client'
import { getValidatedDevices } from '@/lib/deviceSettings'
import { canUseRnnoise } from '@/lib/noiseReductionCapabilities'
import { startRnnoiseMicrophone } from '@/lib/rnnoiseMicrophone'
import { buildAudioCaptureOptions, buildAudioCaptureOptionsForMode } from '@/lib/voiceAudioCaptureOptions'
import { getNoiseReductionMode } from '@/lib/voiceProcessingSettings'

/**
 * Mutes/unmutes the local microphone publication when present; otherwise falls back to LiveKit enable API
 * or RNNoise pipeline when appropriate.
 */
export async function setLocalMicTransmissionEnabled(
  room: Room,
  enabled: boolean,
  isCurrent: () => boolean = () => true
): Promise<void> {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  const t = pub?.track
  if (t) {
    if (enabled && isCurrent()) {
      await t.unmute()
      if (!isCurrent()) await t.mute()
    } else await t.mute()
    return
  }
  if (enabled) {
    const { audioInput } = await getValidatedDevices()
    if (!isCurrent()) return
    const deviceId = audioInput || undefined
    const mode = getNoiseReductionMode()
    if (mode === 'rnnoise' && canUseRnnoise()) {
      const opts = buildAudioCaptureOptions(deviceId)
      try {
        await startRnnoiseMicrophone(room, opts, isCurrent)
      } catch {
        if (!isCurrent()) return
        const fallback = buildAudioCaptureOptionsForMode('standard', deviceId)
        room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...fallback }
        await publishMicrophone(room, fallback, isCurrent)
      }
    } else {
      await publishMicrophone(
        room,
        buildAudioCaptureOptionsForMode(mode === 'rnnoise' ? 'standard' : mode, deviceId),
        isCurrent
      )
    }
  } else {
    await room.localParticipant.setMicrophoneEnabled(false)
  }
}

async function publishMicrophone(
  room: Room,
  options: Parameters<typeof createLocalAudioTrack>[0],
  isCurrent: () => boolean
) {
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
