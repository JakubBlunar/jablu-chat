import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/** Stable scroll targets survive while expensive offscreen message trees are parked. */
export function revealMessageElement(id: string): HTMLElement | null {
  const element = document.getElementById(id)
  element?.dispatchEvent(new Event('message:reveal'))
  return element
}

export function WindowedMessage({ id, root, initialMounted, estimate, label, decoration, children }: {
  id: string
  root: RefObject<HTMLDivElement | null>
  initialMounted: boolean
  estimate: number
  label: string
  decoration?: ReactNode
  children: ReactNode
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
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setMounted(true)
      else {
        // Editors, menus, playback and keyboard focus keep their component state.
        const selection = window.getSelection()
        const busy = element.contains(document.activeElement) ||
          (selection && !selection.isCollapsed && element.contains(selection.anchorNode)) ||
          element.querySelector('[data-message-interactive="true"]') ||
          [...element.querySelectorAll<HTMLMediaElement>('audio, video')].some((media) => !media.paused)
        if (!busy) setMounted(false)
      }
    }, { root: viewport, rootMargin: '700px 0px' })
    observer.observe(element)
    return () => { observer.disconnect(); element.removeEventListener('message:reveal', reveal) }
  }, [root])

  return (
    <div ref={ref} id={id} data-message-window data-message-mounted={mounted} style={{ display: 'flow-root' }}>
      {decoration}
      <div ref={body} style={{ display: 'flow-root', ...(mounted ? {} : { height: height.current }) }}>
        {mounted ? children : (
          <button type="button" className="sr-only focus:not-sr-only" onFocus={() => { focusOnMount.current = true; setMounted(true) }} onClick={() => setMounted(true)} aria-label={label} />
        )}
      </div>
    </div>
  )
}
