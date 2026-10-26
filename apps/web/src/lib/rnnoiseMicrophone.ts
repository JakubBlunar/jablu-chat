import type { Room, AudioCaptureOptions } from 'livekit-client'
import { voiceTrackSources } from './voiceTrackSources'
import { createMicrophoneCapture, type MicrophoneCapture } from './microphoneCapture'

type ActiveRnnoise = MicrophoneCapture & { room: Room }
let active: ActiveRnnoise | null = null
let pendingRoom: Room | null = null
let generation = 0

export function isRnnoiseMicrophoneActive(): boolean {
  return active !== null
}

export async function startRnnoiseMicrophone(
  room: Room,
  options: AudioCaptureOptions,
  isCurrent: () => boolean = () => true
): Promise<void> {
  await stopRnnoiseMicrophone(room)
  const request = ++generation
  pendingRoom = room
  const valid = () => request === generation && isCurrent()
  let capture: MicrophoneCapture | undefined
  try {
    capture = await createMicrophoneCapture('rnnoise', options)
    if (!valid()) {
      await capture.dispose()
      return
    }
    await room.localParticipant.publishTrack(capture.track, {
      name: 'microphone',
      source: voiceTrackSources.Microphone,
      audioPreset: { maxBitrate: 128_000 },
      dtx: true,
      red: true
    })
    if (!valid()) {
      await room.localParticipant.unpublishTrack(capture.track)
      await capture.dispose()
      return
    }
    active = { ...capture, room }
  } catch (error) {
    await capture?.dispose()
    throw error
  } finally {
    if (pendingRoom === room && request === generation) pendingRoom = null
  }
}

export async function stopRnnoiseMicrophone(room: Room | null): Promise<void> {
  if (pendingRoom === room) {
    generation++
    pendingRoom = null
  }
  if (!active || active.room !== room) return
  const capture = active
  active = null
  const disposing = capture.dispose()
  try {
    await capture.room.localParticipant.unpublishTrack(capture.track)
  } finally {
    await disposing
  }
}
