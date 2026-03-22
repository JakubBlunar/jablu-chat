const KEYS = {
  audioInput: "chat:voice:input",
  audioOutput: "chat:voice:output",
  camera: "chat:voice:camera",
  cameraQuality: "chat:voice:camera-quality",
  backgroundBlur: "chat:voice:bg-blur",
} as const;

const SETTINGS_VERSION_KEY = "chat:settings-version";
const CURRENT_VERSION = 1;

export function migrateSettings() {
  const stored = Number(localStorage.getItem(SETTINGS_VERSION_KEY) || "0");
  if (stored < CURRENT_VERSION) {
    // v0 -> v1: no destructive changes, just stamp the version
    localStorage.setItem(SETTINGS_VERSION_KEY, String(CURRENT_VERSION));
  }
}

export function getSavedAudioInput(): string {
  return localStorage.getItem(KEYS.audioInput) || "";
}

export function setSavedAudioInput(id: string) {
  localStorage.setItem(KEYS.audioInput, id);
}

export function getSavedAudioOutput(): string {
  return localStorage.getItem(KEYS.audioOutput) || "";
}

export function setSavedAudioOutput(id: string) {
  localStorage.setItem(KEYS.audioOutput, id);
}

export function getSavedCamera(): string {
  return localStorage.getItem(KEYS.camera) || "";
}

export function setSavedCamera(id: string) {
  localStorage.setItem(KEYS.camera, id);
}

export type CameraQuality = "360p" | "480p" | "720p" | "1080p";

export const CAMERA_PRESETS: Record<
  CameraQuality,
  { width: number; height: number; fps: number }
> = {
  "360p": { width: 640, height: 360, fps: 15 },
  "480p": { width: 854, height: 480, fps: 30 },
  "720p": { width: 1280, height: 720, fps: 30 },
  "1080p": { width: 1920, height: 1080, fps: 30 },
};

export function getSavedCameraQuality(): CameraQuality {
  return (localStorage.getItem(KEYS.cameraQuality) as CameraQuality) || "720p";
}

export function setSavedCameraQuality(q: CameraQuality) {
  localStorage.setItem(KEYS.cameraQuality, q);
}

export function getSavedBlurEnabled(): boolean {
  return localStorage.getItem(KEYS.backgroundBlur) === "true";
}

export function setSavedBlurEnabled(enabled: boolean) {
  localStorage.setItem(KEYS.backgroundBlur, String(enabled));
}

/**
 * Validates that a saved deviceId still exists among available devices.
 * Returns the deviceId if it's still available, or "" (default) otherwise.
 */
export async function validateDeviceId(
  savedId: string,
  kind: MediaDeviceKind,
): Promise<string> {
  if (!savedId) return "";
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const match = devices.find(
      (d) => d.kind === kind && d.deviceId === savedId,
    );
    return match ? savedId : "";
  } catch {
    return "";
  }
}

/**
 * Returns validated device IDs ready to use with LiveKit.
 * Falls back to defaults if saved devices are no longer available.
 */
export async function getValidatedDevices(): Promise<{
  audioInput: string;
  audioOutput: string;
  camera: string;
}> {
  const [audioInput, audioOutput, camera] = await Promise.all([
    validateDeviceId(getSavedAudioInput(), "audioinput"),
    validateDeviceId(getSavedAudioOutput(), "audiooutput"),
    validateDeviceId(getSavedCamera(), "videoinput"),
  ]);
  return { audioInput, audioOutput, camera };
}
