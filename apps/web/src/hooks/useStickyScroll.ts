import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Reusable scroll-to-bottom logic for chat message lists rendered inside SimpleBar.
 *
 * Handles:
 * - Force-scrolling to bottom on channel/conversation switch
 * - Staying stuck to bottom as new messages arrive
 * - Suppressing scroll-position checks during the transition window
 * - ResizeObserver-based auto-scroll for dynamically sized content (images, embeds)
 * - Scroll-to-bottom button visibility
 */
export function useStickyScroll(itemId: string | null, messageCount: number, hasNewer = false) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const forceScrollRef = useRef(false)
  const scrolledIdRef = useRef<string | null>(null)
  const suppressAutoScrollRef = useRef(false)
  const hasNewerRef = useRef(hasNewer)
  hasNewerRef.current = hasNewer
  const prevLen = useRef(0)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const isNearBottom = useCallback((px = 40) => {
    const el = scrollRef.current
    if (!el) return true
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return true
    const threshold = Math.min(px, maxScroll * 0.5)
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const stickToBottom = useCallback(() => {
    stickRef.current = true
    setShowScrollBtn(false)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const showScrollBtnRef = useRef(false)
  const onScroll = useCallback(() => {
    if (forceScrollRef.current) return
    const near = isNearBottom()
    stickRef.current = hasNewerRef.current ? false : near
    const shouldShow = !near
    if (shouldShow !== showScrollBtnRef.current) {
      showScrollBtnRef.current = shouldShow
      setShowScrollBtn(shouldShow)
    }
  }, [isNearBottom])

  const resetForItem = useCallback(() => {
    scrolledIdRef.current = null
    prevLen.current = 0
    if (!suppressAutoScrollRef.current) {
      forceScrollRef.current = true
      stickRef.current = true
    }
    setShowScrollBtn(false)
  }, [])

  // ResizeObserver: auto-scroll when content grows (e.g. images loading)
  useEffect(() => {
    const content = contentRef.current
    const container = scrollRef.current
    if (!content || !container) return

    const observer = new ResizeObserver(() => {
      if (suppressAutoScrollRef.current || hasNewerRef.current) return
      if ((stickRef.current || forceScrollRef.current) && isNearBottom(150)) {
        container.scrollTop = container.scrollHeight
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [isNearBottom])

  // Guaranteed scroll-to-bottom after first batch of messages loads for a new item
  useEffect(() => {
    if (!itemId || messageCount === 0) return
    if (scrolledIdRef.current === itemId) return
    scrolledIdRef.current = itemId

    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false
      forceScrollRef.current = false
      stickRef.current = false
      return
    }

    const el = scrollRef.current
    if (!el) return
    const snap = () => {
      el.scrollTop = el.scrollHeight
    }
    snap()
    const raf = requestAnimationFrame(snap)
    const t1 = setTimeout(snap, 50)
    const t2 = setTimeout(() => {
      snap()
      forceScrollRef.current = false
      stickRef.current = true
    }, 120)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [itemId, messageCount])

  // Incremental new-message scroll (stay stuck when already at bottom)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (messageCount > prevLen.current && stickRef.current && !suppressAutoScrollRef.current && !hasNewerRef.current) {
      el.scrollTop = el.scrollHeight
    }
    prevLen.current = messageCount
  }, [messageCount])

  return {
    scrollRef,
    contentRef,
    showScrollBtn,
    scrollToBottom,
    stickToBottom,
    onScroll,
    resetForItem,
    suppressAutoScrollRef
  }
}
