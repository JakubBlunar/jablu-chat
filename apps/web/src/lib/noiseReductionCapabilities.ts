/**
 * Runtime capability probes for noise-reduction features (varies by browser / Electron Chromium version).
 */

export type NoiseReductionCapabilities = {
  audioWorklet: boolean
  /** Chromium-style voice isolation constraint (e.g. Chrome desktop). */
  voiceIsolation: boolean
}

export function getNoiseReductionCapabilities(): NoiseReductionCapabilities {
  const audioWorklet = typeof AudioWorkletNode !== 'undefined'

  let voiceIsolation = false
  try {
    const c = navigator.mediaDevices?.getSupportedConstraints?.() as MediaTrackSupportedConstraints & {
      voiceIsolation?: boolean
    }
    voiceIsolation = !!c?.voiceIsolation
  } catch {
    voiceIsolation = false
  }

  return { audioWorklet, voiceIsolation }
}

/** RNNoise path needs AudioWorklet + getUserMedia (no extra flag beyond worklet today). */
export function canUseRnnoise(): boolean {
  return getNoiseReductionCapabilities().audioWorklet
}
