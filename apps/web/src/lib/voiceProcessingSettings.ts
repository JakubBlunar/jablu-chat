export type NoiseReductionMode = 'standard' | 'enhanced_browser' | 'rnnoise'

const MODE_KEY = 'chat:voice:noise-reduction-mode'
const CAPTURE_NS_KEY = 'chat:voice:capture-noise-suppression'
const CAPTURE_AGC_KEY = 'chat:voice:capture-auto-gain'
const CAPTURE_ECHO_KEY = 'chat:voice:capture-echo-cancellation'

const VALID_MODES: NoiseReductionMode[] = ['standard', 'enhanced_browser', 'rnnoise']

export function getNoiseReductionMode(): NoiseReductionMode {
  const v = localStorage.getItem(MODE_KEY)
  return v && VALID_MODES.includes(v as NoiseReductionMode) ? (v as NoiseReductionMode) : 'standard'
}

export function setNoiseReductionMode(mode: NoiseReductionMode) {
  localStorage.setItem(MODE_KEY, mode)
}

export function getCaptureNoiseSuppression(): boolean {
  return localStorage.getItem(CAPTURE_NS_KEY) !== 'false'
}

export function setCaptureNoiseSuppression(on: boolean) {
  localStorage.setItem(CAPTURE_NS_KEY, String(on))
}

export function getCaptureAutoGainControl(): boolean {
  return localStorage.getItem(CAPTURE_AGC_KEY) !== 'false'
}

export function setCaptureAutoGainControl(on: boolean) {
  localStorage.setItem(CAPTURE_AGC_KEY, String(on))
}

export function getCaptureEchoCancellation(): boolean {
  return localStorage.getItem(CAPTURE_ECHO_KEY) !== 'false'
}

export function setCaptureEchoCancellation(on: boolean) {
  localStorage.setItem(CAPTURE_ECHO_KEY, String(on))
}
