export { ApiError } from './errors'
export { ApiClient } from './client'
export * from './types'

import { ApiClient } from './client'
import { getServerBaseUrl } from '../serverUrl'

export const api = new ApiClient()
// On desktop the base URL is baked in at build time; on web it stays same-origin.
api.baseUrl = getServerBaseUrl()

export function resolveMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path
  return api.baseUrl ? `${api.baseUrl}${path}` : path
}
