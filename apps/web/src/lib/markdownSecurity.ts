/**
 * Pure security utilities for markdown rendering.
 * No external imports — safe to test directly in jsdom.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Explicitly declared attribute allow-lists for media elements.
 * These are intentionally restricted — autoPlay is excluded to prevent
 * audio/video-based harassment (autoplaying content injected by a user).
 */
export const VIDEO_ALLOWED_ATTRS = [
  'src', 'controls', 'muted', 'playsInline', 'className', 'class',
] as const

export const AUDIO_ALLOWED_ATTRS = [
  'src', 'controls', 'className', 'class',
] as const
