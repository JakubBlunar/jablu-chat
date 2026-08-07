import { isDesktop } from '@/lib/desktop'

const STORAGE_KEY = 'jablu:deviceId'

let cached: string | null = null

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/**
 * Stable per-install identifier, used to pair a live socket session with the push
 * subscription belonging to the same device. Survives reloads; a cleared browser
 * profile simply gets a new id, which is harmless.
 */
export function getDeviceId(): string {
  if (cached) return cached
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      cached = stored
      return stored
    }
    const next = randomId()
    localStorage.setItem(STORAGE_KEY, next)
    cached = next
    return next
  } catch {
    // Private mode or blocked storage: fall back to a per-session id.
    cached ??= randomId()
    return cached
  }
}

export type DevicePlatform = 'desktop' | 'mobile' | 'web'

export function getDevicePlatform(): DevicePlatform {
  if (isDesktop) return 'desktop'
  if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return 'mobile'
  }
  return 'web'
}
