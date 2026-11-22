import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'

type RowListener = (entry: IntersectionObserverEntry) => void
const pools = new WeakMap<Element, { observer: IntersectionObserver; listeners: Map<Element, RowListener> }>()

export function observeMessageRow(viewport: Element, row: Element, listener: RowListener) {
  let pool = pools.get(viewport)
  if (!pool) {
    const listeners = new Map<Element, RowListener>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) listeners.get(entry.target)?.(entry)
      },
      { root: viewport, rootMargin: '700px 0px' }
    )
    pool = { observer, listeners }
    pools.set(viewport, pool)
  }
  pool.listeners.set(row, listener)
  pool.observer.observe(row)
  return () => {
    pool.listeners.delete(row)
    pool.observer.unobserve(row)
    if (!pool.listeners.size) {
      pool.observer.disconnect()
      pools.delete(viewport)
    }
  }
}

/** Stable scroll targets survive while expensive offscreen message trees are parked. */
export function revealMessageElement(id: string): HTMLElement | null {
  const element = document.getElementById(id)
  // Mounted targets already have measurable content. Dispatching their reveal
  // from a scroll effect needlessly invokes flushSync inside React's lifecycle.
  if (element?.dataset.messageMounted === 'false') element.dispatchEvent(new Event('message:reveal', { bubbles: true }))
  return element
}

export function WindowedMessage({ id, root, initialMounted, estimate, label, decoration, children, aliasIds }: {
  id: string
  root: RefObject<HTMLDivElement | null>
  initialMounted: boolean
  estimate: number
  label: string
  decoration?: ReactNode
  children: ReactNode
  aliasIds?: string[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const focusOnMount = useRef(false)
  const height = useRef(estimate)
  const [mounted, setMounted] = useState(initialMounted)

  useLayoutEffect(() => {
    if (!mounted || !body.current) return
    const element = body.current
    const measure = () => {
      const next = element.getBoundingClientRect().height || height.current
      const viewport = root.current
      if (viewport && element.getBoundingClientRect().bottom <= viewport.getBoundingClientRect().top) {
        viewport.scrollTop += next - height.current
      }
      height.current = next
    }
    measure()
    if (focusOnMount.current) {
      focusOnMount.current = false
      element.querySelector<HTMLElement>('[tabindex], button')?.focus({ preventScroll: true })
    }
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mounted, root])

  useEffect(() => {
    const element = ref.current
    const viewport = root.current
    if (!element || !viewport) return
    const reveal = () => { flushSync(() => setMounted(true)) }
    element.addEventListener('message:reveal', reveal)
    if (typeof IntersectionObserver === 'undefined') return () => element.removeEventListener('message:reveal', reveal)
    const unobserve = observeMessageRow(viewport, element, (entry) => {
      if (entry.isIntersecting) setMounted(true)
      else {
        // Editors, menus, playback and keyboard focus keep their component state.
        const selection = window.getSelection()
        const busy =
          element.contains(document.activeElement) ||
          (selection &&
            !selection.isCollapsed &&
            selection.rangeCount > 0 &&
            selection.getRangeAt(0).intersectsNode(element)) ||
          element.querySelector('[data-message-interactive="true"]') ||
          [...element.querySelectorAll<HTMLMediaElement>('audio, video')].some((media) => !media.paused)
        if (!busy) setMounted(false)
      }
    })
    return () => {
      unobserve()
      element.removeEventListener('message:reveal', reveal)
    }
  }, [root])

  return (
    <div ref={ref} id={id} data-message-window data-message-mounted={mounted} data-last-message-id={aliasIds?.at(-1)?.slice(4)} style={{ display: 'flow-root', position: 'relative' }}>
      {aliasIds?.map((alias) => <div key={alias} id={alias} data-message-mounted={mounted}
        aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md" />)}
      {decoration}
      <div ref={body} style={{ display: 'flow-root', ...(mounted ? {} : { height: height.current }) }}>
        {mounted ? children : (
          <button type="button" className="sr-only focus:not-sr-only" onFocus={() => { focusOnMount.current = true; setMounted(true) }} onClick={() => setMounted(true)} aria-label={label} />
        )}
      </div>
    </div>
  )
}
