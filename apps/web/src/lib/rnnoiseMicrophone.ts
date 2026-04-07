import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm'
import noiseWorkletUrl from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url'
import { Track, type LocalTrackPublication, type Room } from 'livekit-client'
import type { AudioCaptureOptions } from 'livekit-client'
import { getCaptureAutoGainControl, getCaptureEchoCancellation } from '@/lib/voiceProcessingSettings'

type ActiveRnnoise = {
  audioContext: AudioContext
  disposeGraph: () => void
  publication: LocalTrackPublication | undefined
}

let active: ActiveRnnoise | null = null

export function isRnnoiseMicrophoneActive(): boolean {
  return active !== null
}

function disconnectNodes(
  source: MediaStreamAudioSourceNode,
  worklet: AudioWorkletNode,
  dest: MediaStreamAudioDestinationNode
) {
  try {
    source.disconnect()
    worklet.disconnect()
    dest.disconnect()
  } catch {
    /* ignore */
  }
}

/**
 * Publishes a microphone track processed by RNNoise (AudioWorklet + WASM).
 */
export async function startRnnoiseMicrophone(room: Room, audioDefaults: AudioCaptureOptions): Promise<void> {
  await stopRnnoiseMicrophone(room)

  const constraints: MediaTrackConstraints = {
    channelCount: 1,
    noiseSuppression: false,
    echoCancellation: getCaptureEchoCancellation(),
    autoGainControl: getCaptureAutoGainControl()
  }
  if (audioDefaults.deviceId) {
    constraints.deviceId = audioDefaults.deviceId
  }

  const rawStream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
  // 48 kHz matches WebRTC/Opus defaults; avoids extra resample drift vs the RNNoise worklet.
  const audioContext = new AudioContext({ sampleRate: 48_000 })

  let source: MediaStreamAudioSourceNode | null = null
  let worklet: AudioWorkletNode | null = null
  let dest: MediaStreamAudioDestinationNode | null = null

  try {
    await audioContext.resume()
    await audioContext.audioWorklet.addModule(noiseWorkletUrl as string)

    source = audioContext.createMediaStreamSource(rawStream)
    worklet = new AudioWorkletNode(audioContext, NoiseSuppressorWorklet_Name)
    dest = audioContext.createMediaStreamDestination()
    source.connect(worklet)
    worklet.connect(dest)

    const outTrack = dest.stream.getAudioTracks()[0]
    if (!outTrack) {
      throw new Error('RNNoise produced no audio track')
    }

    const publication = await room.localParticipant.publishTrack(outTrack, {
      name: 'microphone',
      source: Track.Source.Microphone,
      audioPreset: { maxBitrate: 128_000 },
      dtx: true,
      red: true
    })

    const disposeGraph = () => {
      disconnectNodes(source!, worklet!, dest!)
      rawStream.getTracks().forEach((t) => t.stop())
      dest!.stream.getTracks().forEach((t) => t.stop())
    }

    active = { audioContext, disposeGraph, publication }
  } catch (err) {
    if (source && worklet && dest) {
      disconnectNodes(source, worklet, dest)
    }
    rawStream.getTracks().forEach((t) => t.stop())
    if (dest) {
      dest.stream.getTracks().forEach((t) => t.stop())
    }
    await audioContext.close().catch(() => {})
    throw err
  }
}

export async function stopRnnoiseMicrophone(room: Room | null): Promise<void> {
  if (!active) return

  const { audioContext, disposeGraph, publication } = active
  active = null

  disposeGraph()

  if (publication?.track && room) {
    try {
      await room.localParticipant.unpublishTrack(publication.track)
    } catch {
      /* ignore */
    }
  }

  await audioContext.close().catch(() => {})
}
