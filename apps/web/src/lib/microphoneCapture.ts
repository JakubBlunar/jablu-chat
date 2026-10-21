import { createLocalAudioTrack, LocalAudioTrack, type AudioCaptureOptions } from 'livekit-client'
import type { NoiseReductionMode } from './voiceProcessingSettings'

export type MicrophoneCapture = {
  track: LocalAudioTrack
  dispose: () => Promise<void>
}

/** Shared by calls and the local recording test, so both use the same processing. */
export async function createMicrophoneCapture(
  mode: NoiseReductionMode,
  options: AudioCaptureOptions
): Promise<MicrophoneCapture> {
  if (mode !== 'rnnoise') {
    const track = await createLocalAudioTrack(options)
    return {
      track,
      dispose: async () => {
        track.stop()
      }
    }
  }

  const raw = await navigator.mediaDevices.getUserMedia({ audio: options as MediaTrackConstraints })
  let ctx: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let worklet: AudioWorkletNode | undefined
  let dest: MediaStreamAudioDestinationNode | undefined
  const dispose = async () => {
    source?.disconnect()
    worklet?.disconnect()
    dest?.disconnect()
    raw.getTracks().forEach((track) => track.stop())
    dest?.stream.getTracks().forEach((track) => track.stop())
    if (ctx && ctx.state !== 'closed') await ctx.close()
  }
  try {
    ctx = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' })
    await ctx.resume()
    const [{ NoiseSuppressorWorklet_Name }, { default: workletUrl }] = await Promise.all([
      import('@timephy/rnnoise-wasm'),
      import('@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url')
    ])
    await ctx.audioWorklet.addModule(workletUrl)
    source = ctx.createMediaStreamSource(raw)
    worklet = new AudioWorkletNode(ctx, NoiseSuppressorWorklet_Name, { outputChannelCount: [1] })
    dest = ctx.createMediaStreamDestination()
    dest.channelCount = 1
    dest.channelCountMode = 'explicit'
    source.connect(worklet)
    worklet.connect(dest)
    const track = dest.stream.getAudioTracks()[0]
    if (!track) throw new Error('RNNoise produced no audio track')
    return { track: new LocalAudioTrack(track, undefined, true), dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
