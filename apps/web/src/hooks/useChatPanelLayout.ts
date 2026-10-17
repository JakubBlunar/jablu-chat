import { useLayoutEffect, useState } from 'react'
import { PANEL_LIMITS } from '@/stores/settings.store'

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
  return {
    ref,
    overlay: width < 480 + PANEL_LIMITS.secondary.min,
    membersOverlay: width < 480 + PANEL_LIMITS.members.min,
    maxPanelWidth: Math.max(PANEL_LIMITS.secondary.min, width - 480),
    maxMemberWidth: Math.max(PANEL_LIMITS.members.min, width - 480)
  }
}
