import { useEffect, useRef, type RefObject } from 'react'
import { isAppFocused, subscribeAppVisibility } from '@/lib/appVisibility'
import { useReadStateStore } from '@/stores/readState.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { inboxPausesRead, useInboxStore } from '@/stores/inbox.store'
import { registerChatPresentation } from '@/lib/chatPresentation'

export function useChannelAck(
  mode: 'channel' | 'dm',
  contextId: string | null,
  {
    ready,
    atBottom,
    scrollParentRef,
    callChatVisible = false,
    threadParentId = null,
    latestMessageId
  }: {
    ready: boolean
    atBottom: boolean
    scrollParentRef: RefObject<HTMLDivElement | null>
    callChatVisible?: boolean
    threadParentId?: string | null
    latestMessageId?: string
  }
): void {
  const lastAcknowledged = useRef<{ scope: string; messageId: string } | null>(null)
  const readState = useReadStateStore((s) =>
    contextId && !threadParentId ? (mode === 'channel' ? s.channels : s.dms).get(contextId) : undefined
  )
  const inboxPaused = useInboxStore(
    (s) => s.open || (s.reader?.target.mode === mode && s.reader.target.contextId === contextId)
  )

  useEffect(() => {
    if (!contextId || threadParentId) return
    const rs = useReadStateStore.getState()
    if (mode === 'channel') rs.captureChannelView(contextId)
    else rs.captureDmView(contextId)
  }, [mode, contextId, readState, threadParentId])

  useEffect(() => {
    if (mode === 'dm' && contextId) useReadStateStore.getState().resumeDmAck(contextId)
  }, [mode, contextId])

  useEffect(() => {
    lastAcknowledged.current = null
  }, [mode, contextId, threadParentId])

  useEffect(() => {
    return () => {
      if (!contextId || threadParentId) return
      const rs = useReadStateStore.getState()
      if (mode === 'channel') rs.clearChannelView(contextId)
      else rs.clearDmView(contextId)
    }
  }, [mode, contextId, threadParentId])

  useEffect(() => {
    if (!contextId || !ready || inboxPaused) return
    const scope = `${mode}:${contextId}:${threadParentId ?? ''}`
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending = false
    const canRead = () => {
      const el = scrollParentRef.current
      const voice = useVoiceConnectionStore.getState()
      const visibleInCall =
        callChatVisible && mode === 'dm' && !!voice.currentDmCallId && voice.currentChannelId === contextId
      if (!(
        isAppFocused() &&
        !inboxPausesRead(mode, contextId) &&
        (!voice.viewingVoiceRoom || visibleInCall) &&
        !(mode === 'dm' && useReadStateStore.getState().pausedDmAcks.has(contextId)) &&
        !!el &&
        el.scrollHeight - el.scrollTop - el.clientHeight < 30
      )) return false
      if (typeof document.elementFromPoint === 'function') {
        const bounds = el.getBoundingClientRect()
        const x = (Math.max(0, bounds.left) + Math.min(window.innerWidth, bounds.right)) / 2
        const y = Math.min(window.innerHeight, bounds.bottom) - 16
        if (y < bounds.top || !el.contains(document.elementFromPoint(x, y))) return false
      }
      return true
    }
    const unregister = registerChatPresentation(mode, contextId, threadParentId, canRead)
    const schedule = () => {
      clearTimeout(timer)
      if (!canRead()) return
      timer = setTimeout(async () => {
        if (pending || !canRead()) return
        const rows = scrollParentRef.current!.querySelectorAll<HTMLElement>('[data-message-window]')
        const row = rows[rows.length - 1]
        const throughMessageId = row?.dataset.lastMessageId ?? row?.id.slice(4)
        if (!throughMessageId || row.dataset.messageMounted !== 'true' ||
          (latestMessageId && throughMessageId !== latestMessageId)) return
        if (lastAcknowledged.current?.scope === scope && lastAcknowledged.current.messageId === throughMessageId) return
        const rs = useReadStateStore.getState()
        const boundary = { throughMessageId, ...(threadParentId ? { threadParentId } : {}) }
        pending = true
        try {
          if (await (mode === 'channel' ? rs.ackChannel(contextId, boundary) : rs.ackDm(contextId, boundary))) {
            lastAcknowledged.current = { scope, messageId: throughMessageId }
          }
        } finally {
          pending = false
        }
      }, 250)
    }
    schedule()
    // Geometry can settle after the "atBottom" flag changes (smooth scrolling,
    // image loading, viewport changes). Retry from the actual surface instead
    // of waiting for another React state transition that may never happen.
    const element = scrollParentRef.current
    element?.addEventListener('scroll', schedule, { passive: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    if (element) {
      resize?.observe(element)
      if (element.firstElementChild) resize?.observe(element.firstElementChild)
    }
    const unsubscribe = subscribeAppVisibility(schedule)
    return () => {
      clearTimeout(timer)
      unregister()
      unsubscribe()
      element?.removeEventListener('scroll', schedule)
      resize?.disconnect()
    }
  }, [mode, contextId, readState?.lastReadAt, readState?.unreadCount, ready, atBottom, scrollParentRef, inboxPaused,
    callChatVisible, threadParentId, latestMessageId])
}
