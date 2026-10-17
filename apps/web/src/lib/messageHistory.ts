import type { Message } from '@chat/shared'
import { ApiError } from '@/lib/api/errors'

export type HistoryErrorKey = 'messageUnavailable' | 'historyLoadFailed'

export function requireMessageTarget(messages: readonly Message[], messageId: string): void {
  if (!messages.some((message) => message.id === messageId)) throw new Error('messageUnavailable')
}

export function historyErrorKey(error: unknown): HistoryErrorKey {
  return (error instanceof Error && error.message === 'messageUnavailable') ||
    (error instanceof ApiError && (error.status === 403 || error.status === 404))
    ? 'messageUnavailable'
    : 'historyLoadFailed'
}
