import { useSettingsStore } from '@/stores/settings.store'

export type CameraQuality = '360p' | '480p' | '720p' | '1080p'

export const CAMERA_PRESETS: Record<CameraQuality, { width: number; height: number; fps: number }> = {
  '360p': { width: 640, height: 360, fps: 15 },
  '480p': { width: 854, height: 480, fps: 30 },
  '720p': { width: 1280, height: 720, fps: 30 },
  '1080p': { width: 1920, height: 1080, fps: 30 }
}

export function getSavedAudioInput(): string {
  return useSettingsStore.getState().audioInputDeviceId
}

export function setSavedAudioInput(id: string) {
  useSettingsStore.getState().setAudioInputDeviceId(id)
}

export function getSavedAudioOutput(): string {
  return useSettingsStore.getState().audioOutputDeviceId
}

export function setSavedAudioOutput(id: string) {
  useSettingsStore.getState().setAudioOutputDeviceId(id)
}

export function getSavedCamera(): string {
  return useSettingsStore.getState().cameraDeviceId
}

export function setSavedCamera(id: string) {
  useSettingsStore.getState().setCameraDeviceId(id)
}

export function getSavedCameraQuality(): CameraQuality {
  return useSettingsStore.getState().cameraQuality
}

export function setSavedCameraQuality(q: CameraQuality) {
  useSettingsStore.getState().setCameraQuality(q)
}

export function getSavedBlurEnabled(): boolean {
  return useSettingsStore.getState().backgroundBlurEnabled
}

export function setSavedBlurEnabled(enabled: boolean) {
  useSettingsStore.getState().setBackgroundBlurEnabled(enabled)
}

/**
 * Validates that a saved deviceId still exists among available devices.
 * Returns the deviceId if it's still available, or "" (default) otherwise.
 */
export async function validateDeviceId(savedId: string, kind: MediaDeviceKind): Promise<string> {
  if (!savedId) return ''
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const match = devices.find((d) => d.kind === kind && d.deviceId === savedId)
    return match ? savedId : ''
  } catch {
    return ''
  }
}

/**
 * Returns validated device IDs ready to use with LiveKit.
 * Falls back to defaults if saved devices are no longer available.
 */
export async function getValidatedDevices(): Promise<{
  audioInput: string
  audioOutput: string
  camera: string
}> {
  const [audioInput, audioOutput, camera] = await Promise.all([
    validateDeviceId(getSavedAudioInput(), 'audioinput'),
    validateDeviceId(getSavedAudioOutput(), 'audiooutput'),
    validateDeviceId(getSavedCamera(), 'videoinput')
  ])
  return { audioInput, audioOutput, camera }
}
