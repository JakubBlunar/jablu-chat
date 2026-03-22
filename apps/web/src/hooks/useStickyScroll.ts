import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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
export function useStickyScroll(itemId: string | null, messageCount: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const forceScrollRef = useRef(false);
  const scrolledIdRef = useRef<string | null>(null);
  const prevLen = useRef(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const stickToBottom = useCallback(() => {
    stickRef.current = true;
    setShowScrollBtn(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const onScroll = useCallback(() => {
    if (forceScrollRef.current) return;
    const near = isNearBottom();
    stickRef.current = near;
    setShowScrollBtn(!near);
  }, [isNearBottom]);

  const resetForItem = useCallback(() => {
    scrolledIdRef.current = null;
    prevLen.current = 0;
    forceScrollRef.current = true;
    stickRef.current = true;
    setShowScrollBtn(false);
  }, []);

  // ResizeObserver: auto-scroll when content grows (e.g. images loading)
  useEffect(() => {
    const content = contentRef.current;
    const container = scrollRef.current;
    if (!content || !container) return;

    const observer = new ResizeObserver(() => {
      if (stickRef.current || forceScrollRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Guaranteed scroll-to-bottom after first batch of messages loads for a new item
  useEffect(() => {
    if (!itemId || messageCount === 0) return;
    if (scrolledIdRef.current === itemId) return;
    scrolledIdRef.current = itemId;

    const el = scrollRef.current;
    if (!el) return;
    const snap = () => { el.scrollTop = el.scrollHeight; };
    snap();
    const raf = requestAnimationFrame(snap);
    const t1 = setTimeout(snap, 50);
    const t2 = setTimeout(() => {
      snap();
      forceScrollRef.current = false;
      stickRef.current = true;
    }, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [itemId, messageCount]);

  // Incremental new-message scroll (stay stuck when already at bottom)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (messageCount > prevLen.current && stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevLen.current = messageCount;
  }, [messageCount]);

  return {
    scrollRef,
    contentRef,
    showScrollBtn,
    scrollToBottom,
    stickToBottom,
    onScroll,
    resetForItem,
  };
}
