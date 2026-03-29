export { ApiError } from './errors'
export { ApiClient } from './client'
export * from './types'

import { ApiClient } from './client'

export const api = new ApiClient()

export function resolveMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path
  return api.baseUrl ? `${api.baseUrl}${path}` : path
}
