import { isDesktop } from './desktop'

// Injected by Vite at build time (see vite.config.ts `define`). Guarded with
// `typeof` so the SWC/CommonJS jest transform, which leaves these as bare
// identifiers, resolves them to safe defaults instead of throwing.
declare const __JABLU_SERVER_URL__: string
declare const __JABLU_DEV__: boolean

// Baked at build time for the desktop app. Empty for web/PWA, which talks to its
// own origin.
const BAKED = (typeof __JABLU_SERVER_URL__ !== 'undefined' ? __JABLU_SERVER_URL__ : '').replace(
  /\/+$/,
  ''
)
const IS_DEV = typeof __JABLU_DEV__ !== 'undefined' ? __JABLU_DEV__ : false

/**
 * Absolute base URL the desktop app uses for API, socket, media and share links.
 * - Web/PWA: '' (same-origin relative requests).
 * - Desktop release: the URL baked in at build time.
 * - Desktop dev: falls back to the local server.
 */
export function getServerBaseUrl(): string {
  if (!isDesktop) return ''
  if (BAKED) return BAKED
  if (IS_DEV) return 'http://localhost:3001'
  return ''
}
