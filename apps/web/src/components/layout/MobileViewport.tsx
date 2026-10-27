import { useRef, type ReactNode } from 'react'
import { useVisualViewport } from '@/hooks/useVisualViewport'

export function MobileViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useVisualViewport(ref)
  return (
    <div
      ref={ref}
      data-mobile-viewport
      className="fixed inset-x-0 top-0 flex h-[100dvh] flex-col overflow-hidden bg-surface pt-[env(safe-area-inset-top)] text-white"
      style={{ paddingBottom: 'var(--keyboard-safe-area-bottom, env(safe-area-inset-bottom, 0px))' }}
    >
      {children}
    </div>
  )
}
