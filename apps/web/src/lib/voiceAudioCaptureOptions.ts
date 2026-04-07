import type { AudioCaptureOptions } from 'livekit-client'
import {
  getCaptureAutoGainControl,
  getCaptureEchoCancellation,
  getCaptureNoiseSuppression,
  getNoiseReductionMode
} from '@/lib/voiceProcessingSettings'
import type { NoiseReductionMode } from '@/lib/voiceProcessingSettings'
import { getNoiseReductionCapabilities } from '@/lib/noiseReductionCapabilities'

/**
 * Maps noise mode + capture toggles to LiveKit `audioCaptureDefaults` / `setMicrophoneEnabled` options.
 */
export function buildAudioCaptureOptionsForMode(
  mode: NoiseReductionMode,
  deviceId: string | undefined
): AudioCaptureOptions {
  const caps = getNoiseReductionCapabilities()
  const ns = getCaptureNoiseSuppression()
  const agc = getCaptureAutoGainControl()
  const echo = getCaptureEchoCancellation()

  const opts: AudioCaptureOptions = {
    channelCount: 1,
    noiseSuppression: mode === 'rnnoise' ? false : ns,
    echoCancellation: echo,
    autoGainControl: agc
  }

  if (deviceId) {
    opts.deviceId = { exact: deviceId }
  }

  if (mode === 'enhanced_browser' && caps.voiceIsolation) {
    opts.voiceIsolation = { ideal: true }
  }

  return opts
}

export function buildAudioCaptureOptions(deviceId: string | undefined): AudioCaptureOptions {
  return buildAudioCaptureOptionsForMode(getNoiseReductionMode(), deviceId)
}
