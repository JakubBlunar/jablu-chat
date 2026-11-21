import { useEffect, useRef, type RefObject } from 'react'
import { isAppFocused, subscribeAppVisibility } from '@/lib/appVisibility'
import { useNavigationStore } from '@/stores/navigation.store'
import { inboxPausesRead, useInboxStore } from '@/stores/inbox.store'
import { useReadStateStore } from '@/stores/readState.store'

/** A deep link can acknowledge an individual alert while showing older history. */
export function useSeenMessageAlert(
  mode: 'channel' | 'dm',
  contextId: string,
  threadParentId: string | null,
  viewportRef: RefObject<HTMLDivElement | null>,
  ready: boolean
) {
  const request = useNavigationStore((s) => s.request)
  const navId = useNavigationStore((s) => s.activeNavId)
  const inboxOpen = useInboxStore((s) => s.open)
  const seen = useRef<number | null>(null)

  useEffect(() => {
    if (!ready || inboxOpen || seen.current === navId || request?.position?.kind !== 'message') return
    const { position, target, source } = request
    if (source !== 'notification' && source !== 'inbox' && source !== 'route') return
    const id = target.kind === 'channel' ? target.channelId : target.kind === 'dm' ? target.conversationId : null
    if (target.kind !== mode || id !== contextId || (position.threadParentId ?? null) !== threadParentId) return
    const viewport = viewportRef.current
    if (!viewport || typeof document.elementFromPoint !== 'function') return
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending = false

    const visible = () => {
      if (!isAppFocused() || inboxPausesRead(mode, contextId)) return false
      const row = document.getElementById(`msg-${position.messageId}`)?.closest<HTMLElement>('[data-message-window]')
      if (!row || !viewport.contains(row) || row.dataset.messageMounted !== 'true') return false
      const bounds = row.getBoundingClientRect()
      const clip = viewport.getBoundingClientRect()
      const left = Math.max(bounds.left, clip.left, 0)
      const right = Math.min(bounds.right, clip.right, window.innerWidth)
      const top = Math.max(bounds.top, clip.top, 0)
      const bottom = Math.min(bounds.bottom, clip.bottom, window.innerHeight)
      return right > left && bottom - top >= Math.min(16, bounds.height) &&
        row.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
    }
    const sample = () => {
      clearTimeout(timer)
      if (pending || seen.current === navId || !visible()) return
      timer = setTimeout(async () => {
        if (!visible()) return
        const { ackDm, ackChannel } = useReadStateStore.getState()
        const boundary = { throughMessageId: position.messageId, seenOnly: true, ...(threadParentId && { threadParentId }) }
        pending = true
        try {
          if (await (mode === 'dm' ? ackDm(contextId, boundary) : ackChannel(contextId, boundary))) seen.current = navId
        } finally {
          pending = false
        }
      }, 350)
    }
    viewport.addEventListener('scroll', sample, { passive: true })
    const observer = new MutationObserver(sample)
    observer.observe(viewport, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-message-mounted'] })
    const unsubscribe = subscribeAppVisibility(sample)
    sample()
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      unsubscribe()
      viewport.removeEventListener('scroll', sample)
    }
  }, [mode, contextId, threadParentId, viewportRef, ready, request, navId, inboxOpen])
}
