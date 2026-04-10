import { useSettingsStore } from '@/stores/settings.store'

export type NoiseReductionMode = 'standard' | 'enhanced_browser' | 'rnnoise'

export function getNoiseReductionMode(): NoiseReductionMode {
  return useSettingsStore.getState().noiseReductionMode
}

export function setNoiseReductionMode(mode: NoiseReductionMode) {
  useSettingsStore.getState().setNoiseReductionMode(mode)
}

export function getCaptureNoiseSuppression(): boolean {
  return useSettingsStore.getState().captureNoiseSuppression
}

export function setCaptureNoiseSuppression(on: boolean) {
  useSettingsStore.getState().setCaptureNoiseSuppression(on)
}

export function getCaptureAutoGainControl(): boolean {
  return useSettingsStore.getState().captureAutoGainControl
}

export function setCaptureAutoGainControl(on: boolean) {
  useSettingsStore.getState().setCaptureAutoGainControl(on)
}

export function getCaptureEchoCancellation(): boolean {
  return useSettingsStore.getState().captureEchoCancellation
}

export function setCaptureEchoCancellation(on: boolean) {
  useSettingsStore.getState().setCaptureEchoCancellation(on)
}
