import type { Message } from '@chat/shared'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { historyErrorKey, requireMessageTarget, type HistoryErrorKey } from '@/lib/messageHistory'
import { revealMessageElement } from '@/components/chat/WindowedMessage'
import { scrollWithin } from '@/lib/scrollWithin'

export interface ScrollStoreAdapter {
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  hasNewer: boolean
  scrollToMessageId: string | null
  scrollRequestNonce: number
  /** A navigation preload owns the store until it commits or is cancelled. */
  deferInitialLoad?: boolean
  requestJump: (messageId: string) => void
  requestLatest: () => void
  fetchMessages: (id: string, before?: string) => Promise<void>
  fetchMessagesAround: (id: string, messageId: string) => Promise<void>
  fetchNewerMessages?: (id: string) => Promise<void>
  clearMessages: () => void
  setScrollToMessageId: (id: string | null) => void
  getLoadedForId: () => string | null
  getSnapshot: () => {
    messages: Message[]
    isLoading: boolean
    hasMore: boolean
    hasNewer: boolean
    error?: string | null
  }
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
  historyError?: HistoryErrorKey | null
  retryHistory?: () => void
  dismissHistoryError?: () => void
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
function attachInitialLoadImageAnchor(sp: HTMLElement, shouldSnap: () => boolean): () => void {
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
  const escapedId =
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(prevTopId) : prevTopId.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
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
    fetchNewerMessages,
    setScrollToMessageId,
    getLoadedForId
  } = store
  const deferInitialLoad = store.deferInitialLoad ?? false

  const storeRef = useRef(store)
  storeRef.current = store

  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null)
  const newerSentinelRef = useRef<HTMLDivElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const settling = !!deferInitialLoad
  const activeContextRef = useRef(contextId)
  activeContextRef.current = contextId
  const [historyFailure, setHistoryFailure] = useState<{
    contextId: string | null
    key: HistoryErrorKey
    retry: () => void
  } | null>(null)
  const failureContextRef = useRef<string | null>(null)
  const historyRequest = useRef(0)
  const cancelHistory = useCallback(() => {
    ++historyRequest.current
  }, [])
  useLayoutEffect(() => cancelHistory, [contextId, fetchMessages, cancelHistory])

  const runHistory = useCallback(
    async function run(action: () => Promise<void>, onSuccess?: () => void, checkError = true) {
      if (activeContextRef.current !== contextId) return
      const request = ++historyRequest.current
      failureContextRef.current = null
      setHistoryFailure(null)
      try {
        await action()
        if (activeContextRef.current !== contextId || historyRequest.current !== request) return
        const error = storeRef.current.getSnapshot().error
        if (checkError && error) throw new Error(error)
        onSuccess?.()
      } catch (error) {
        if (activeContextRef.current !== contextId || historyRequest.current !== request) return
        console.error('Failed to load message history', error)
        failureContextRef.current = contextId
        setHistoryFailure({
          contextId,
          key: historyErrorKey(error),
          retry: () => {
            void run(action, onSuccess, checkError)
          }
        })
      }
    },
    [contextId]
  )

  const dismissHistoryError = useCallback(() => {
    cancelHistory()
    failureContextRef.current = null
    setHistoryFailure(null)

    storeRef.current.setScrollToMessageId(null)
    storeRef.current.requestLatest()
  }, [cancelHistory])

  const atBottomRef = useRef(true)
  atBottomRef.current = atBottom
  const viewportHeightRef = useRef<number | null>(null)

  const FORCE_BOTTOM_WINDOW_MS = 1000
  const forceBottomUntilRef = useRef(0)

  const armForceBottom = useCallback(() => {
    forceBottomUntilRef.current = Date.now() + FORCE_BOTTOM_WINDOW_MS
  }, [])

  const goToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const sp = scrollParentRef.current
      if (!sp) return
      if (behavior === 'smooth') {
        sp.scrollTo({ top: sp.scrollHeight, behavior: 'smooth' })
      } else {
        sp.scrollTop = sp.scrollHeight
      }
      setAtBottom(true)
      armForceBottom()
    },
    [armForceBottom]
  )

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
  }, [messages.length, isLoading, contextId, getLoadedForId, armForceBottom])

  /* ── Snap to bottom when a NEW bottom message is appended ──
   * With the chronological flex layout (no flex-col-reverse) the browser
   * does NOT keep us pinned to the bottom when content grows below the
   * viewport. A new message arriving via socket grows scrollHeight while
   * scrollTop stays put, which would otherwise leave the user staring at
   * the previous bottom while their just-sent message sits hidden below.
   *
   * We track the id of the last message and, on every commit where it
   * changed (i.e. a message was actually appended to the bottom — not a
   * load-older prepend, not an edit), synchronously re-snap to the bottom
   * before paint. The same gates as elsewhere apply: skip when an initial
   * load or scroll-to-message is in flight, and only snap when the user
   * is currently at the bottom (or just sent a message and the
   * force-bottom window is still active). */
  const prevLastMsgIdRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    const lastId = messages.length > 0 ? messages[messages.length - 1].id : null
    const changed = lastId !== null && lastId !== prevLastMsgIdRef.current
    prevLastMsgIdRef.current = lastId
    if (!changed) return
    if (pendingGoToBottom.current) return
    if (storeRef.current.scrollToMessageId !== null) return

    const sp = scrollParentRef.current
    if (!sp) return
    if (!atBottomRef.current && Date.now() >= forceBottomUntilRef.current) return

    sp.scrollTop = sp.scrollHeight
  }, [messages])

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

    const cancelImgAnchor = attachInitialLoadImageAnchor(
      sp,
      () => atBottomRef.current || Date.now() < forceBottomUntilRef.current
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
    mo.observe(sp, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'width', 'height']
    })

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

  /* ── Position the coordinator's loaded window; never start initial reads. ── */
  const prevIdRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (deferInitialLoad) return
    const prev = prevIdRef.current
    if (prev && prev !== contextId) storeRef.current.onContextLeave?.(prev)
    prevIdRef.current = contextId
    hasInitialSnappedRef.current = false
    anchorMsgRef.current = null
    const target = storeRef.current.scrollToMessageId
    pendingGoToBottom.current = !!contextId && !target
    if (contextId && !target && getLoadedForId() === contextId) {
      const viewport = scrollParentRef.current
      if (viewport) viewport.scrollTop = viewport.scrollHeight
      pendingGoToBottom.current = false
      hasInitialSnappedRef.current = true
      setAtBottom(true)
      armForceBottom()
    }
    return () => {
      if (contextId) storeRef.current.onContextLeave?.(contextId)
    }
  }, [contextId, getLoadedForId, armForceBottom, deferInitialLoad])

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
        if (
          loadingOlderRef.current ||
          !contextId ||
          !messagesRef.current.length ||
          failureContextRef.current === contextId
        )
          return
        // Suppress load-older until the initial-load snap has fired for this
        // context. Otherwise the top sentinel briefly intersects between when
        // messages render and when our snap moves us to the bottom, triggering
        // a spurious older-page fetch that strands the user mid-list.
        if (!hasInitialSnappedRef.current || pendingGoToBottom.current || Date.now() < forceBottomUntilRef.current)
          return
        const snap = storeRef.current.getSnapshot()
        if (!snap.hasMore || snap.isLoading) return

        loadingOlderRef.current = true
        const prevScrollTop = sp.scrollTop
        const prevScrollHeight = sp.scrollHeight
        const prevTopId = messagesRef.current[0].id
        const cursor = messagesRef.current[0].id
        void runHistory(
          () => fetchMessages(contextId, cursor),
          () => {
            requestAnimationFrame(() => {
              sp.scrollTop = prevScrollTop + (sp.scrollHeight - prevScrollHeight)
              attachLoadOlderImageAnchor(sp, prevTopId)
            })
          }
        ).finally(() => {
          loadingOlderRef.current = false
        })
      },
      { root: sp, rootMargin: '200px 0px 0px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [contextId, fetchMessages, hasMore, runHistory])

  /* ── Load newer messages (bottom/newer sentinel) ── */
  const loadingNewerRef = useRef(false)

  useEffect(() => {
    const sentinel = newerSentinelRef.current
    const sp = scrollParentRef.current
    if (!sentinel || !sp || !fetchNewerMessages) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        if (
          loadingNewerRef.current ||
          !contextId ||
          !messagesRef.current.length ||
          failureContextRef.current === contextId
        )
          return
        const snap = storeRef.current.getSnapshot()
        if (!snap.hasNewer || snap.isLoading) return

        loadingNewerRef.current = true
        const msgs = messagesRef.current
        const anchorId = msgs[msgs.length - 1]?.id
        void runHistory(
          () => fetchNewerMessages(contextId),
          () => {
            if (!anchorId) return
            requestAnimationFrame(() => {
              scrollWithin(sp, revealMessageElement(`msg-${anchorId}`), 'end')
            })
          }
        ).finally(() => {
          loadingNewerRef.current = false
        })
      },
      { root: sp, rootMargin: '0px 0px 200px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [contextId, fetchNewerMessages, hasNewer, runHistory])

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
    viewportHeightRef.current = sp.clientHeight
    let rafId: number

    const ro = new ResizeObserver(() => {
      const w = sp.clientWidth
      const height = sp.clientHeight
      const widthChanged = w !== prevWidth
      const heightChanged = height !== viewportHeightRef.current
      if (!widthChanged && !heightChanged) return
      prevWidth = w
      viewportHeightRef.current = height

      if (atBottomRef.current) {
        cancelAnimationFrame(rafId)
        if (heightChanged) {
          sp.scrollTop = sp.scrollHeight
        } else {
          rafId = requestAnimationFrame(() => {
            sp.scrollTop = sp.scrollHeight
          })
        }
        return
      }

      if (!widthChanged) return
      const id = anchorMsgRef.current
      if (!id) return
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        scrollWithin(sp, revealMessageElement(id))
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
      if (viewportHeightRef.current !== null && sp.clientHeight !== viewportHeightRef.current) return
      const isAtBottom = sp.scrollHeight - sp.scrollTop - sp.clientHeight < AT_BOTTOM_THRESHOLD
      atBottomRef.current = isAtBottom
      setAtBottom(isAtBottom)
    }

    sp.addEventListener('scroll', check, { passive: true })
    check()
    return () => sp.removeEventListener('scroll', check)
  }, [messages.length])

  /* ── Scroll-to-message ── */
  useEffect(() => {
    if (!scrollToMessageId || !contextId || deferInitialLoad) return

    // An inbox/query jump can supersede the initial unread load in the same
    // channel. It owns positioning now: release the hidden initial view and
    // prevent that older load from restoring its anchor or snapping to bottom.
    pendingGoToBottom.current = false
    forceBottomUntilRef.current = 0
    const targetId = scrollToMessageId
    let cancelled = false
    const jump = async () => {
      try {
        if (storeRef.current.getLoadedForId() !== contextId) throw new Error('historyLoadFailed')
        if (cancelled) return
        requireMessageTarget(storeRef.current.getSnapshot().messages, targetId)
        if (document.getElementById(`msg-${targetId}`)?.dataset.messageMounted === 'false') {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        }
        let el: HTMLElement | null = null
        for (let attempt = 0; attempt < 50 && !cancelled; attempt++) {
          el = revealMessageElement(`msg-${targetId}`)
          if (el) break
          await new Promise<void>((resolve) => setTimeout(resolve, 50))
        }
        if (cancelled) return
        if (!el) throw new Error('historyLoadFailed')
        scrollWithin(scrollParentRef.current, el)
        setAtBottom(false)
        hasInitialSnappedRef.current = true
        pendingGoToBottom.current = false
        forceBottomUntilRef.current = 0
        el.classList.add('bg-primary/10')
        const highlighted = el
        setTimeout(() => {
          highlighted.style.transition = 'background-color 1s ease'
          void highlighted.offsetHeight
          highlighted.classList.remove('bg-primary/10')
          setTimeout(() => {
            highlighted.style.transition = ''
          }, 1000)
        }, 5000)
        setScrollToMessageId(null)
      } catch (error) {
        if (!cancelled) throw error
      }
    }
    void runHistory(jump, undefined, false)
    return () => {
      cancelled = true
    }
  }, [scrollToMessageId, scrollRequestNonce, contextId, setScrollToMessageId, runHistory, deferInitialLoad])

  const handleJumpToMessage = useCallback((messageId: string) => {
    storeRef.current.requestJump(messageId)
  }, [])

  /* ── Stick to bottom ── */
  const stickToBottom = useCallback(() => {
    goToBottom()
  }, [goToBottom])

  const handleBottomButtonClick = useCallback(() => {
    const snap = storeRef.current.getSnapshot()
    if (snap.hasNewer) storeRef.current.requestLatest()
    else goToBottom('smooth')
  }, [goToBottom])

  const visibleFailure = historyFailure?.contextId === contextId ? historyFailure : null

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
      handleJumpToMessage,
      historyError: visibleFailure?.key ?? null,
      retryHistory: visibleFailure?.retry,
      dismissHistoryError
    }),
    [
      atBottom,
      settling,
      stickToBottom,
      handleBottomButtonClick,
      handleJumpToMessage,
      visibleFailure,
      dismissHistoryError
    ]
  )
}
