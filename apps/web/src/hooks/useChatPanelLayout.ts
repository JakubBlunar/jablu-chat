import { useLayoutEffect, useState } from 'react'

export function useChatPanelLayout() {
  const [container, ref] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(window.innerWidth)
  useLayoutEffect(() => {
    if (!container) return
    const measure = () => setWidth(container.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])
  return { ref, overlay: width < 800, membersOverlay: width < 720 }
}
