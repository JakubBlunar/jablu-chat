/**
 * A 403 on a context the client had cached means access was revoked, most
 * likely while the app was closed. The cached copy has to go, not just be
 * refreshed.
 */
export function isForbidden(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 403
}
