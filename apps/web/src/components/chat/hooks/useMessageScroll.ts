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

const LOAD_OLDER_IMAGE_ANCHOR_WINDOW_MS = 3000
const INITIAL_LOAD_IMAGE_ANCHOR_WINDOW_MS = 1000

/**
 * After the initial channel/DM load snap, lazy-loading images (attachments,
 * embeds, custom emojis, markdown inline images) often resolve their final
 * height milliseconds-to-seconds after the first paint. With
 * `overflow-anchor: none` we can't rely on the browser to keep us pinned to
 * the bottom; instead we listen for every <img> in the scroll container and,
 * for each load/error event within the window, re-snap to the new bottom as
 * long as the user is still considered at bottom or the force-bottom window
 * is active. This is the same belt-and-braces strategy Discord uses on top
 * of their ResizeObserver-based scroll manager.
 */
function attachInitialLoadImageAnchor(
  sp: HTMLElement,
  shouldSnap: () => boolean
): () => void {
  const imgs = Array.from(sp.querySelectorAll('img')).filter((img) => !img.complete)
  if (imgs.length === 0) return () => {}

  let cleaned = false

  const handle = () => {
    if (cleaned) return
    if (shouldSnap()) {
      sp.scrollTop = sp.scrollHeight
    }
  }

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    for (const img of imgs) {
      img.removeEventListener('load', handle)
      img.removeEventListener('error', handle)
    }
    clearTimeout(timeoutId)
  }

  for (const img of imgs) {
    img.addEventListener('load', handle, { once: true })
    img.addEventListener('error', handle, { once: true })
  }

  const timeoutId = setTimeout(cleanup, INITIAL_LOAD_IMAGE_ANCHOR_WINDOW_MS)
  return cleanup
}

/**
 * After older messages are prepended, asynchronously-loading images can grow
 * the scrollable content height above the user's viewport. With
 * `overflow-anchor: none` the browser will not compensate for this, so the
 * user's visible content would appear to drift upward. This helper listens
 * for image load/error events on newly-prepended messages for a short window
 * and adjusts `scrollTop` to keep the visual anchor stable.
 */
function attachLoadOlderImageAnchor(sp: HTMLElement, prevTopId: string): void {
  const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(prevTopId) : prevTopId.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  const anchor = sp.querySelector(`#msg-${escapedId}`)
  if (!anchor) return

  const allImgs = Array.from(sp.querySelectorAll('img'))
  const newImgs = allImgs.filter((img) => {
    const pos = img.compareDocumentPosition(anchor)
    return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && !img.complete
  })

  if (newImgs.length === 0) return

  let prevHeight = sp.scrollHeight
  let cleaned = false

  const handle = () => {
    if (cleaned) return
    const h = sp.scrollHeight
    if (h !== prevHeight) {
      sp.scrollTop += h - prevHeight
      prevHeight = h
    }
  }

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    for (const img of newImgs) {
      img.removeEventListener('load', handle)
      img.removeEventListener('error', handle)
    }
    sp.removeEventListener('wheel', onUserScroll)
    sp.removeEventListener('touchmove', onUserScroll)
    clearTimeout(timeoutId)
  }

  const onUserScroll = (e: Event) => {
    if (e.type === 'wheel') {
      const w = e as WheelEvent
      if (Math.abs(w.deltaY) < 1) return
    }
    cleanup()
  }

  for (const img of newImgs) {
    img.addEventListener('load', handle, { once: true })
    img.addEventListener('error', handle, { once: true })
  }
  sp.addEventListener('wheel', onUserScroll, { passive: true })
  sp.addEventListener('touchmove', onUserScroll, { passive: true })

  const timeoutId = setTimeout(cleanup, LOAD_OLDER_IMAGE_ANCHOR_WINDOW_MS)
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

  const atBottomRef = useRef(true)
  atBottomRef.current = atBottom

  const FORCE_BOTTOM_WINDOW_MS = 1000
  const forceBottomUntilRef = useRef(0)

  const armForceBottom = useCallback(() => {
    forceBottomUntilRef.current = Date.now() + FORCE_BOTTOM_WINDOW_MS
  }, [])

  const goToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const sp = scrollParentRef.current
    if (!sp) return
    if (behavior === 'smooth') {
      sp.scrollTo({ top: sp.scrollHeight, behavior: 'smooth' })
    } else {
      sp.scrollTop = sp.scrollHeight
    }
    setAtBottom(true)
    armForceBottom()
  }, [armForceBottom])

  const pendingGoToBottom = useRef(false)
  const anchorMsgRef = useRef<string | null>(null)

  const justSnappedRef = useRef(false)

  // True after the initial-load snap has fired for the current contextId.
  // Reset to false whenever we switch context. Used to gate load-older so
  // that the briefly-intersecting top sentinel during the initial render
  // (before the snap moves us to the bottom) doesn't accidentally fetch
  // a second older page and strand the user mid-list.
  const hasInitialSnappedRef = useRef(false)

  useLayoutEffect(() => {
    if (!pendingGoToBottom.current) return
    if (isLoading) return
    if (getLoadedForId() !== contextId) return

    pendingGoToBottom.current = false
    hasInitialSnappedRef.current = true
    if (messages.length > 0) {
      justSnappedRef.current = true
    }

    const sp = scrollParentRef.current
    if (sp) sp.scrollTop = sp.scrollHeight
    armForceBottom()
    setSettling(false)
  }, [messages.length, isLoading, contextId, getLoadedForId, armForceBottom])

  useEffect(() => {
    if (!justSnappedRef.current) return
    justSnappedRef.current = false

    const sp = scrollParentRef.current
    if (!sp) return

    // Deferred snap. Bails if the user has scrolled away (atBottom flipped
    // false) or the force-bottom window has expired. This lets wheel/touchmove
    // cancellation actually take effect immediately instead of being yanked
    // back by a late timer.
    const snap = () => {
      if (!sp) return
      if (!atBottomRef.current && Date.now() >= forceBottomUntilRef.current) return
      sp.scrollTop = sp.scrollHeight
    }
    requestAnimationFrame(snap)
    armForceBottom()
    const t1 = setTimeout(snap, 100)
    const t2 = setTimeout(snap, 300)
    const t3 = setTimeout(snap, 600)
    const t4 = setTimeout(snap, 1000)

    const cancelImgAnchor = attachInitialLoadImageAnchor(sp, () =>
      atBottomRef.current || Date.now() < forceBottomUntilRef.current
    )

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      cancelImgAnchor()
    }
  }, [messages.length, armForceBottom])

  /* ── Keep at bottom while content settles (images loading, etc.) ── */
  useEffect(() => {
    const sp = scrollParentRef.current
    if (!sp) return
    if (!atBottom && Date.now() >= forceBottomUntilRef.current) return

    let prevScrollHeight = sp.scrollHeight
    let rafId: number

    const snapIfNeeded = () => {
      const h = sp.scrollHeight
      if (h === prevScrollHeight) return
      prevScrollHeight = h
      if (atBottomRef.current || Date.now() < forceBottomUntilRef.current) {
        sp.scrollTop = sp.scrollHeight
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

  /* ── Cancel force-bottom window on user-initiated upward scroll ── */
  useEffect(() => {
    const sp = scrollParentRef.current
    if (!sp) return

    const cancel = (e: Event) => {
      if (e.type === 'wheel') {
        const w = e as WheelEvent
        if (w.deltaY >= 0) return
      }
      forceBottomUntilRef.current = 0
    }

    sp.addEventListener('wheel', cancel, { passive: true })
    sp.addEventListener('touchmove', cancel, { passive: true })
    return () => {
      sp.removeEventListener('wheel', cancel)
      sp.removeEventListener('touchmove', cancel)
    }
  }, [])

  /* ── Context switch ── */
  const prevIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const prev = prevIdRef.current

    if (prev && prev !== contextId) {
      storeRef.current.onContextLeave?.(prev)
    }

    if (contextId) {
      const alreadyLoaded = getLoadedForId() === contextId
      // A "real" context switch (not the initial mount) happens when prev was
      // set to some other context. We must re-arm the snap-to-bottom logic on
      // every such switch — even if the store already has the data, because
      // navigation.store may pre-fetch before flipping the channel id. Without
      // this, the new scroll container starts at scrollTop=0 and the briefly
      // visible top sentinel triggers load-older, stranding the user mid-list.
      const isContextSwitch = prev !== null && prev !== contextId

      if (!alreadyLoaded) {
        storeRef.current.onContextJoin?.(contextId)
      }
      prevIdRef.current = contextId

      // If a scroll-to-message request is pending, do NOT auto-snap to bottom
      // here — that would fight the scroll-to-message useEffect (it would
      // either flash to bottom then jump, or get yanked back to bottom by
      // the force-bottom window). The scroll-to-message effect handles its
      // own positioning via scrollIntoView and clears the initial-snap guard
      // once it finishes. Read from storeRef so we don't have to take
      // scrollToMessageId as a dep (we only care about context changes here).
      const hasScrollToTarget = storeRef.current.scrollToMessageId !== null

      if (isContextSwitch) {
        hasInitialSnappedRef.current = false
        anchorMsgRef.current = null
        if (!hasScrollToTarget) setAtBottom(true)
      }

      if (!alreadyLoaded && !hasScrollToTarget) {
        setSettling(true)
        pendingGoToBottom.current = true
        clearMessages()
        void fetchMessages(contextId).then(() => {
          requestAnimationFrame(() => {
            const sp = scrollParentRef.current
            if (sp) sp.scrollTop = sp.scrollHeight
            armForceBottom()
          })
        }).catch(() => {})
      } else if (alreadyLoaded && !hasScrollToTarget) {
        // Data is already in the store. This covers both:
        //   - context switch where navigation.store pre-fetched the target
        //     channel before flipping the channel id
        //   - initial mount where messages are still in the store from
        //     before (e.g. MessageArea remounted after returning from a
        //     voice room or settings panel in the same channel)
        // Snap synchronously here so the new scroll container never paints
        // at scrollTop=0. We cannot rely on the pendingGoToBottom
        // useLayoutEffect because none of its deps change again after this
        // commit, so it wouldn't run a second time.
        const sp = scrollParentRef.current
        if (sp) sp.scrollTop = sp.scrollHeight
        pendingGoToBottom.current = false
        hasInitialSnappedRef.current = true
        armForceBottom()
      }
    } else {
      prevIdRef.current = null
    }

    return () => {
      if (contextId) storeRef.current.onContextLeave?.(contextId)
    }
  }, [contextId, clearMessages, fetchMessages, getLoadedForId, armForceBottom])

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
        // Suppress load-older until the initial-load snap has fired for this
        // context. Otherwise the top sentinel briefly intersects between when
        // messages render and when our snap moves us to the bottom, triggering
        // a spurious older-page fetch that strands the user mid-list.
        if (!hasInitialSnappedRef.current || pendingGoToBottom.current || Date.now() < forceBottomUntilRef.current) return
        const snap = storeRef.current.getSnapshot()
        if (!snap.hasMore || snap.isLoading) return

        loadingOlderRef.current = true
        const prevScrollTop = sp.scrollTop
        const prevScrollHeight = sp.scrollHeight
        const prevTopId = messagesRef.current[0].id
        void fetchMessages(contextId, messagesRef.current[0].id).then(() => {
          requestAnimationFrame(() => {
            sp.scrollTop = prevScrollTop + (sp.scrollHeight - prevScrollHeight)
            attachLoadOlderImageAnchor(sp, prevTopId)
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
        rafId = requestAnimationFrame(() => { sp.scrollTop = sp.scrollHeight })
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
      setAtBottom(sp.scrollHeight - sp.scrollTop - sp.clientHeight < AT_BOTTOM_THRESHOLD)
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
        // Mark initial snap done and clear the force-bottom window so the
        // "Keep at bottom" effect doesn't yank us back after image loads, and
        // so load-older can fire when the user keeps scrolling up.
        hasInitialSnappedRef.current = true
        pendingGoToBottom.current = false
        forceBottomUntilRef.current = 0
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
          if (sp) sp.scrollTop = sp.scrollHeight
          setAtBottom(true)
          armForceBottom()
        })
      }).catch(() => {})
    } else {
      goToBottom('smooth')
    }
  }, [contextId, clearMessages, fetchMessages, goToBottom, armForceBottom])

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
