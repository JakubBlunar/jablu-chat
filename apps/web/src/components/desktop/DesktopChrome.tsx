import type { ReactNode } from 'react'
import { isDesktop } from '@/lib/desktop'
import { useDesktopUpdateSync } from '@/hooks/useDesktopUpdateSync'
import { DesktopTitleBar } from './DesktopTitleBar'

/**
 * On the desktop app, wraps the whole app in a column layout with the custom
 * frameless title bar on top and the routed content filling the rest. On web
 * (browser/PWA) it renders children unchanged.
 *
 * Must live inside the Router: the title bar uses navigation history hooks.
 */
export function DesktopChrome({ children }: { children: ReactNode }) {
  useDesktopUpdateSync()
  if (!isDesktop) return <>{children}</>

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <DesktopTitleBar />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
