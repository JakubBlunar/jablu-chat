import type { Message } from '@chat/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'

interface StoreAdapter {
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  hasNewer: boolean
  scrollToMessageId: string | null
  scrollRequestNonce: number
  fetchMessages: (id: string, before?: string) => Promise<void>
  fetchMessagesAround: (id: string, messageId: string) => Promise<void>
  fetchNewerMessages?: (id: string) => Promise<void>
  clearMessages: () => void
  setScrollToMessageId: (id: string | null) => void
  getLoadedForId: () => string | null
}

export function useMessageScroll(mode: 'channel' | 'dm', contextId: string | null, store: StoreAdapter) {
  const isDm = mode === 'dm'
  const {
    messages,
    hasMore,
    hasNewer,
    scrollToMessageId,
    scrollRequestNonce,
    fetchMessages,
    fetchMessagesAround,
    fetchNewerMessages,
    clearMessages,
    setScrollToMessageId,
    getLoadedForId
  } = store

  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null)
  const newerSentinelRef = useRef<HTMLDivElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)

  const goToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const sp = scrollParentRef.current
    if (!sp) return
    if (behavior === 'smooth') {
      sp.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      sp.scrollTop = 0
    }
    setAtBottom(true)
  }, [])

  const pendingGoToBottom = useRef(false)
  const anchorMsgRef = useRef<string | null>(null)

  const justSnappedRef = useRef(false)

  useLayoutEffect(() => {
    if (!pendingGoToBottom.current || messages.length === 0) return
    pendingGoToBottom.current = false
    justSnappedRef.current = true

    const sp = scrollParentRef.current
    if (!sp) return

    sp.scrollTop = 0
  }, [messages.length])

  useEffect(() => {
    if (!justSnappedRef.current) return
    justSnappedRef.current = false

    const sp = scrollParentRef.current
    if (!sp) return

    const snap = () => { if (sp) sp.scrollTop = 0 }
    requestAnimationFrame(snap)
    const t1 = setTimeout(snap, 100)
    const t2 = setTimeout(snap, 300)

    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [messages.length])

  /* ── Keep at bottom while content settles (images loading, etc.) ── */
  useEffect(() => {
    const sp = scrollParentRef.current
    if (!sp || !atBottom) return

    let prevScrollHeight = sp.scrollHeight
    let rafId: number

    const snapIfNeeded = () => {
      const h = sp.scrollHeight
      if (h !== prevScrollHeight) {
        prevScrollHeight = h
        sp.scrollTop = 0
      }
    }

    const scheduleSnap = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(snapIfNeeded)
    }

    const mo = new MutationObserver(scheduleSnap)
    mo.observe(sp, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'width', 'height'] })

    const ro = new ResizeObserver(scheduleSnap)
    for (const child of sp.children) ro.observe(child)

    return () => {
      cancelAnimationFrame(rafId)
      mo.disconnect()
      ro.disconnect()
    }
  }, [atBottom, messages.length])

  /* ── Context switch ── */
  const prevIdRef = useRef<string | null>(null)

  useEffect(() => {
    const socket = getSocket()
    const prev = prevIdRef.current

    if (prev && prev !== contextId) {
      if (!isDm) socket?.emit('channel:leave', { channelId: prev })
    }

    if (contextId) {
      const alreadyLoaded = getLoadedForId() === contextId

      if (!alreadyLoaded) {
        if (isDm) {
          if (socket?.connected) socket.emit('dm:join', { conversationId: contextId })
        } else {
          socket?.emit('channel:join', { channelId: contextId })
        }
      }
      prevIdRef.current = contextId

      if (!alreadyLoaded) {
        setAtBottom(true)
        pendingGoToBottom.current = true
        anchorMsgRef.current = null
        clearMessages()
        void fetchMessages(contextId).then(() => {
          requestAnimationFrame(() => {
            const sp = scrollParentRef.current
            if (sp) sp.scrollTop = 0
          })
        })
      }
    } else {
      prevIdRef.current = null
    }

    return () => {
      if (!isDm && contextId) {
        getSocket()?.emit('channel:leave', { channelId: contextId })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, clearMessages, fetchMessages, isDm, getLoadedForId])

  /* ── Load older messages (top sentinel) ── */
  const loadingOlderRef = useRef(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    const sentinel = topSentinelRef.current
    const sp = scrollParentRef.current
    if (!sentinel || !sp) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        if (loadingOlderRef.current || !contextId || !messagesRef.current.length) return
        const storeState = isDm ? useDmStore.getState() : useMessageStore.getState()
        if (!storeState.hasMore || storeState.isLoading) return

        loadingOlderRef.current = true
        const prevScrollTop = sp.scrollTop
        void fetchMessages(contextId, messagesRef.current[0].id).then(() => {
          requestAnimationFrame(() => {
            sp.scrollTop = prevScrollTop
          })
        }).finally(() => {
          loadingOlderRef.current = false
        })
      },
      { root: sp, rootMargin: '200px 0px 0px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [contextId, fetchMessages, isDm, hasMore])

  /* ── Load newer messages (bottom/newer sentinel) ── */
  const loadingNewerRef = useRef(false)

  useEffect(() => {
    const sentinel = newerSentinelRef.current
    const sp = scrollParentRef.current
    if (!sentinel || !sp || !fetchNewerMessages) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        if (loadingNewerRef.current || !contextId || !messagesRef.current.length) return
        const storeState = isDm ? useDmStore.getState() : useMessageStore.getState()
        if (!storeState.hasNewer || storeState.isLoading) return

        loadingNewerRef.current = true
        const msgs = messagesRef.current
        const anchorId = msgs[msgs.length - 1]?.id
        void fetchNewerMessages(contextId).then(() => {
          if (!anchorId) return
          requestAnimationFrame(() => {
            document.getElementById(`msg-${anchorId}`)?.scrollIntoView({ block: 'end', behavior: 'auto' })
          })
        }).finally(() => {
          loadingNewerRef.current = false
        })
      },
      { root: sp, rootMargin: '0px 0px 200px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [contextId, fetchNewerMessages, isDm, hasNewer])

  /* ── Anchor message tracking + width-resize restore ── */
  const atBottomRef = useRef(true)
  atBottomRef.current = atBottom

  useEffect(() => {
    const sp = scrollParentRef.current
    if (!sp) return

    let ticking = false
    const updateAnchor = () => {
      ticking = false
      if (atBottomRef.current || pendingGoToBottom.current) {
        anchorMsgRef.current = null
        return
      }
      const rect = sp.getBoundingClientRect()
      const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 3)
      const msgEl = el?.closest('[id^="msg-"]')
      if (msgEl) anchorMsgRef.current = msgEl.id
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(updateAnchor)
      }
    }

    sp.addEventListener('scroll', onScroll, { passive: true })
    updateAnchor()
    return () => sp.removeEventListener('scroll', onScroll)
  }, [messages.length])

  useEffect(() => {
    const sp = scrollParentRef.current
    if (!sp) return

    let prevWidth = sp.clientWidth
    let rafId: number

    const ro = new ResizeObserver(() => {
      const w = sp.clientWidth
      if (w === prevWidth) return
      prevWidth = w

      if (atBottomRef.current) {
        cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => { sp.scrollTop = 0 })
        return
      }

      const id = anchorMsgRef.current
      if (!id) return
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'auto' })
      })
    })

    ro.observe(sp)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [])

  /* ── At-bottom detection (scroll position) ── */
  useEffect(() => {
    const sp = scrollParentRef.current
    if (!sp) return

    const AT_BOTTOM_THRESHOLD = 30

    const check = () => {
      setAtBottom(Math.abs(sp.scrollTop) < AT_BOTTOM_THRESHOLD)
    }

    sp.addEventListener('scroll', check, { passive: true })
    check()
    return () => sp.removeEventListener('scroll', check)
  }, [messages.length])

  /* ── Scroll-to-message ── */
  useEffect(() => {
    if (!scrollToMessageId || !contextId) return

    const targetId = scrollToMessageId
    let cancelled = false
    const startTime = Date.now()
    const TIMEOUT = 8000

    const getStore = () => (isDm ? useDmStore.getState() : useMessageStore.getState())

    const attempt = () => {
      if (cancelled) return
      if (Date.now() - startTime > TIMEOUT) {
        setScrollToMessageId(null)
        return
      }

      const state = getStore()
      const loadedId = isDm
        ? (state as ReturnType<typeof useDmStore.getState>).loadedForConvId
        : (state as ReturnType<typeof useMessageStore.getState>).loadedForChannelId

      if (state.isLoading || state.messages.length === 0 || loadedId !== contextId) {
        setTimeout(attempt, 60)
        return
      }

      const idx = state.messages.findIndex((m) => m.id === targetId)
      if (idx < 0) {
        clearMessages()
        void fetchMessagesAround(contextId, targetId)
        const waitForLoad = () => {
          if (cancelled) return
          const s = getStore()
          if (s.isLoading || s.messages.length === 0) {
            setTimeout(waitForLoad, 60)
            return
          }
          const newIdx = s.messages.findIndex((m) => m.id === targetId)
          if (newIdx >= 0) {
            setScrollToMessageId(null)
            scrollToAndHighlight(targetId)
          } else {
            setScrollToMessageId(null)
          }
        }
        setTimeout(waitForLoad, 100)
        return
      }

      setScrollToMessageId(null)
      scrollToAndHighlight(targetId)
    }

    setTimeout(attempt, 30)
    return () => { cancelled = true }
  }, [scrollToMessageId, scrollRequestNonce, contextId, isDm, clearMessages, fetchMessagesAround, setScrollToMessageId])

  const scrollToAndHighlight = useCallback((messageId: string) => {
    const tryFind = (attempts = 0) => {
      const el = document.getElementById(`msg-${messageId}`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' })
        setAtBottom(false)
        el.classList.add('bg-primary/10')
        setTimeout(() => el.classList.remove('bg-primary/10'), 3000)
      } else if (attempts < 30) {
        setTimeout(() => tryFind(attempts + 1), 50)
      }
    }
    requestAnimationFrame(() => tryFind())
  }, [])

  /* ── Stick to bottom ── */
  const stickToBottom = useCallback(() => {
    goToBottom()
  }, [goToBottom])

  const handleBottomButtonClick = useCallback(() => {
    const storeHasNewer = isDm ? useDmStore.getState().hasNewer : useMessageStore.getState().hasNewer
    if (storeHasNewer && contextId) {
      pendingGoToBottom.current = true
      anchorMsgRef.current = null
      clearMessages()
      void fetchMessages(contextId).then(() => {
        requestAnimationFrame(() => {
          const sp = scrollParentRef.current
          if (sp) sp.scrollTop = 0
          setAtBottom(true)
        })
      })
    } else {
      goToBottom('smooth')
    }
  }, [contextId, clearMessages, fetchMessages, goToBottom, isDm])

  return {
    scrollParentRef,
    topSentinelRef,
    bottomSentinelRef,
    newerSentinelRef,
    atBottom,
    stickToBottom,
    handleBottomButtonClick,
    handleJumpToMessage: scrollToAndHighlight
  }
}
