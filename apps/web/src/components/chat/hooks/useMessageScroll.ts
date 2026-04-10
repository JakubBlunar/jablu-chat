import type { Message } from '@chat/shared'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export interface ScrollStoreAdapter {
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
  getSnapshot: () => { messages: Message[]; isLoading: boolean; hasMore: boolean; hasNewer: boolean }
  onContextJoin?: (contextId: string) => void
  onContextLeave?: (contextId: string) => void
}

export interface ScrollState {
  scrollParentRef: React.RefObject<HTMLDivElement | null>
  topSentinelRef: React.RefObject<HTMLDivElement | null>
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>
  newerSentinelRef: React.RefObject<HTMLDivElement | null>
  atBottom: boolean
  settling: boolean
  stickToBottom: () => void
  handleBottomButtonClick: () => void
  handleJumpToMessage: (messageId: string) => void
}

export function useMessageScroll(contextId: string | null, store: ScrollStoreAdapter): ScrollState {
  const {
    messages,
    isLoading,
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

  const storeRef = useRef(store)
  storeRef.current = store

  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null)
  const newerSentinelRef = useRef<HTMLDivElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [settling, setSettling] = useState(false)

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
    if (!pendingGoToBottom.current) return
    if (isLoading) return
    if (getLoadedForId() !== contextId) return

    pendingGoToBottom.current = false
    if (messages.length > 0) {
      justSnappedRef.current = true
    }

    const sp = scrollParentRef.current
    if (sp) sp.scrollTop = 0
    setSettling(false)
  }, [messages.length, isLoading, contextId, getLoadedForId])

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

  useLayoutEffect(() => {
    const prev = prevIdRef.current

    if (prev && prev !== contextId) {
      storeRef.current.onContextLeave?.(prev)
    }

    if (contextId) {
      const alreadyLoaded = getLoadedForId() === contextId

      if (!alreadyLoaded) {
        storeRef.current.onContextJoin?.(contextId)
      }
      prevIdRef.current = contextId

      if (!alreadyLoaded) {
        setAtBottom(true)
        setSettling(true)
        pendingGoToBottom.current = true
        anchorMsgRef.current = null
        clearMessages()
        void fetchMessages(contextId).then(() => {
          requestAnimationFrame(() => {
            const sp = scrollParentRef.current
            if (sp) sp.scrollTop = 0
          })
        }).catch(() => {})
      }
    } else {
      prevIdRef.current = null
    }

    return () => {
      if (contextId) storeRef.current.onContextLeave?.(contextId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, clearMessages, fetchMessages, getLoadedForId])

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
        const snap = storeRef.current.getSnapshot()
        if (!snap.hasMore || snap.isLoading) return

        loadingOlderRef.current = true
        const prevScrollTop = sp.scrollTop
        void fetchMessages(contextId, messagesRef.current[0].id).then(() => {
          requestAnimationFrame(() => {
            sp.scrollTop = prevScrollTop
          })
        }).catch(() => {}).finally(() => {
          loadingOlderRef.current = false
        })
      },
      { root: sp, rootMargin: '200px 0px 0px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [contextId, fetchMessages, hasMore])

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
        const snap = storeRef.current.getSnapshot()
        if (!snap.hasNewer || snap.isLoading) return

        loadingNewerRef.current = true
        const msgs = messagesRef.current
        const anchorId = msgs[msgs.length - 1]?.id
        void fetchNewerMessages(contextId).then(() => {
          if (!anchorId) return
          requestAnimationFrame(() => {
            document.getElementById(`msg-${anchorId}`)?.scrollIntoView({ block: 'end', behavior: 'auto' })
          })
        }).catch(() => {}).finally(() => {
          loadingNewerRef.current = false
        })
      },
      { root: sp, rootMargin: '0px 0px 200px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [contextId, fetchNewerMessages, hasNewer])

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

    const attempt = () => {
      if (cancelled) return
      if (Date.now() - startTime > TIMEOUT) {
        setScrollToMessageId(null)
        return
      }

      const snap = storeRef.current.getSnapshot()
      const loadedId = storeRef.current.getLoadedForId()

      if (snap.isLoading || snap.messages.length === 0 || loadedId !== contextId) {
        setTimeout(attempt, 60)
        return
      }

      const idx = snap.messages.findIndex((m) => m.id === targetId)
      if (idx < 0) {
        clearMessages()
        void fetchMessagesAround(contextId, targetId)
        const waitForLoad = () => {
          if (cancelled) return
          const s = storeRef.current.getSnapshot()
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
  }, [scrollToMessageId, scrollRequestNonce, contextId, clearMessages, fetchMessagesAround, setScrollToMessageId])

  const scrollToAndHighlight = useCallback((messageId: string) => {
    const tryFind = (attempts = 0) => {
      const el = document.getElementById(`msg-${messageId}`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' })
        setAtBottom(false)
        el.classList.add('bg-primary/10')
        setTimeout(() => {
          el.style.transition = 'background-color 1s ease'
          void el.offsetHeight
          el.classList.remove('bg-primary/10')
          setTimeout(() => { el.style.transition = '' }, 1000)
        }, 5000)
      } else if (attempts < 50) {
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
    const snap = storeRef.current.getSnapshot()
    if (snap.hasNewer && contextId) {
      pendingGoToBottom.current = true
      anchorMsgRef.current = null
      clearMessages()
      void fetchMessages(contextId).then(() => {
        requestAnimationFrame(() => {
          const sp = scrollParentRef.current
          if (sp) sp.scrollTop = 0
          setAtBottom(true)
        })
      }).catch(() => {})
    } else {
      goToBottom('smooth')
    }
  }, [contextId, clearMessages, fetchMessages, goToBottom])

  // Stable object so MessageSurface memo compares meaningfully (refs + callbacks are stable).
  return useMemo(
    () => ({
      scrollParentRef,
      topSentinelRef,
      bottomSentinelRef,
      newerSentinelRef,
      atBottom,
      settling,
      stickToBottom,
      handleBottomButtonClick,
      handleJumpToMessage: scrollToAndHighlight
    }),
    [atBottom, settling, stickToBottom, handleBottomButtonClick, scrollToAndHighlight]
  )
}
