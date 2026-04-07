export type ScreenShareBitratePreset = '720p' | '1080p' | 'native'
export type ScreenShareBitrateFps = 5 | 15 | 20 | 30

const BITRATE_MAP: Record<ScreenShareBitratePreset, Record<ScreenShareBitrateFps, number>> = {
  '720p': { 5: 1_000_000, 15: 2_000_000, 20: 2_500_000, 30: 4_000_000 },
  '1080p': { 5: 2_000_000, 15: 3_500_000, 20: 5_000_000, 30: 8_000_000 },
  /** Fallback when native capture dimensions are missing; 30fps tier matches ~3440×1440 test target (~20 Mbps). */
  native: { 5: 4_300_000, 15: 8_600_000, 20: 11_400_000, 30: 20_000_000 }
}

/** Calibrated so ~3440×1440 @ 30fps lands near NATIVE_BPS_REF. */
const NATIVE_MP_REF = (3440 * 1440) / 1_000_000
const NATIVE_BPS_REF = 20_000_000
const NATIVE_BITRATE_MIN = 2_000_000
const NATIVE_BITRATE_MAX = 30_000_000

function clampScreenShareBitrate(bps: number): number {
  return Math.min(NATIVE_BITRATE_MAX, Math.max(NATIVE_BITRATE_MIN, Math.round(bps)))
}

function bitrateForNativeCapture(
  width: number | undefined,
  height: number | undefined,
  frameRate: number,
  requestedFps: ScreenShareBitrateFps
): number {
  const fallback = BITRATE_MAP.native[requestedFps] ?? BITRATE_MAP.native[30]
  if (!width || !height || width < 16 || height < 16) return fallback

  const megapixels = (width * height) / 1_000_000
  const fpsNorm = frameRate > 0 ? frameRate / 30 : 1
  const derived = (megapixels / NATIVE_MP_REF) * NATIVE_BPS_REF * fpsNorm
  return clampScreenShareBitrate(derived)
}

export function resolveScreenShareMaxBitrate(
  resolution: ScreenShareBitratePreset,
  requestedFps: ScreenShareBitrateFps,
  actual: MediaTrackSettings
): number {
  if (resolution !== 'native') {
    return BITRATE_MAP[resolution][requestedFps]
  }
  const fr =
    actual.frameRate && actual.frameRate > 0 ? actual.frameRate : requestedFps
  return bitrateForNativeCapture(actual.width, actual.height, fr, requestedFps)
}
