import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const traps: HTMLElement[] = []
const isolated = new Map<HTMLElement, boolean>()

function focusableElements(root: HTMLElement | ShadowRoot): HTMLElement[] {
  const elements: HTMLElement[] = []
  for (const child of root.children) {
    if (!(child instanceof HTMLElement)) continue
    const style = getComputedStyle(child)
    if (
      child.hidden ||
      child.inert ||
      child.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden'
    ) {
      continue
    }
    if (child.matches(FOCUSABLE) && child.tabIndex >= 0 && !child.matches(':disabled')) elements.push(child)
    elements.push(...focusableElements(child.shadowRoot ?? child))
  }
  return elements
}

function isolateBackground() {
  for (const [element, inert] of isolated) element.inert = inert
  isolated.clear()
  let branch: HTMLElement | undefined = traps.at(-1)
  while (branch && branch !== document.body) {
    const parent: HTMLElement | null = branch.parentElement
    if (!parent) break
    for (const sibling of parent.children) {
      if (sibling instanceof HTMLElement && sibling !== branch) {
        isolated.set(sibling, sibling.inert)
        sibling.inert = true
      }
    }
    branch = parent
  }
}

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const triggerRef = useRef<HTMLElement | null>(null)
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape

  useEffect(() => {
    if (!active) return

    triggerRef.current = document.activeElement as HTMLElement | null

    const container = containerRef.current
    if (!container) return
    const previousTabIndex = container.getAttribute('tabindex')
    if (previousTabIndex === null) container.tabIndex = -1
    traps.push(container)
    isolateBackground()
    const isTop = () => traps.at(-1) === container
    const focusables = () => focusableElements(container)

    const focusFirst = () => {
      if (!isTop()) return
      const first = focusables()[0]
      if (first) first.focus()
      else container.focus()
    }

    const frame = requestAnimationFrame(focusFirst)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape' && escapeRef.current) {
        e.preventDefault()
        e.stopImmediatePropagation()
        escapeRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = focusables()
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      let activeElement = document.activeElement
      while (activeElement?.shadowRoot?.activeElement) activeElement = activeElement.shadowRoot.activeElement
      if (!container.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }

      if (e.shiftKey) {
        if (activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    const handleFocus = (event: FocusEvent) => {
      if (isTop() && event.target instanceof Node && !container.contains(event.target)) focusFirst()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocus)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocus)
      const index = traps.indexOf(container)
      if (index !== -1) traps.splice(index, 1)
      isolateBackground()
      if (previousTabIndex === null) container.removeAttribute('tabindex')
      const top = traps.at(-1)
      if (triggerRef.current?.isConnected && (!top || top.contains(triggerRef.current))) {
        triggerRef.current.focus()
      } else top?.focus()
    }
  }, [active, containerRef])
}
