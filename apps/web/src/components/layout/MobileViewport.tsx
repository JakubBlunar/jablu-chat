import { useRef, type ReactNode } from 'react'
import { useVisualViewport } from '@/hooks/useVisualViewport'
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe'
import { getIsMobileDevice, getIsStandalone } from '@/hooks/usePwaInstall'
import { drawerEdgeWidth } from '@/lib/horizontalGesture'
import { useLayoutStore } from '@/stores/layout.store'

export function MobileViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useVisualViewport(ref)
  const openNavDrawer = useLayoutStore((s) => s.openNavDrawer)
  const mobilePwa = getIsMobileDevice() && getIsStandalone()
  const menuSwipe = useHorizontalSwipe('right', openNavDrawer, {
    startsAtEdge: (event) => event.touches[0].clientX <= drawerEdgeWidth &&
      event.target instanceof Element && !event.target.closest('[role="dialog"], [role="menu"]'),
    preventBrowserPan: mobilePwa,
    elementRef: ref
  })
  return (
    <div
      data-mobile-viewport
      {...(mobilePwa ? menuSwipe : { ref })}
      className="fixed inset-x-0 top-0 flex h-[100dvh] flex-col overflow-hidden bg-surface pt-[env(safe-area-inset-top)] text-white"
      style={{ paddingBottom: 'var(--keyboard-safe-area-bottom, env(safe-area-inset-bottom, 0px))' }}
    >
      {children}
    </div>
  )
}
