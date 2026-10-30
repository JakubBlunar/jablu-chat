import type { ConversationOutcome, ConversationRequest } from './conversationTarget'

export type {
  ConversationRequest,
  ConversationTarget,
  ConversationPosition,
  ConversationOutcome
} from './conversationTarget'
export { conversationPath, parseConversationPath } from './conversationTarget'

export type ConversationRouter = (path: string, options?: { replace?: boolean; state?: unknown }) => void
type Open = (request: ConversationRequest, options?: { replace?: boolean }) => Promise<ConversationOutcome>
let open: Open | null = null
let bind: ((router: ConversationRouter | null) => void) | null = null
let router: ConversationRouter | null = null
let queued: {
  request: ConversationRequest
  options?: { replace?: boolean }
  resolve: (outcome: ConversationOutcome) => void
} | null = null

/** Installed once by the coordinator; feature imports stay independent of stores. */
export function registerConversationCoordinator(handler: Open, bindRouter: NonNullable<typeof bind>) {
  open = handler
  bind = bindRouter
  bind(router)
  if (queued) {
    const intent = queued
    queued = null
    void handler(intent.request, intent.options).then(intent.resolve)
  }
}

export function bindConversationRouter(next: ConversationRouter | null) {
  router = next
  bind?.(next)
}

/** The public entry point for opening or positioning any conversation. */
export function openConversation(
  request: ConversationRequest,
  options?: { replace?: boolean }
): Promise<ConversationOutcome> {
  if (open) return open(request, options)
  queued?.resolve({ status: 'cancelled' })
  return new Promise((resolve) => {
    queued = { request, options, resolve }
  })
}
