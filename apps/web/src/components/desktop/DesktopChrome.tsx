import { lazy, Suspense, type ReactNode } from 'react'
import { isDesktop } from '@/lib/desktop'
import { useDesktopUpdateSync } from '@/hooks/useDesktopUpdateSync'
const DesktopTitleBar = lazy(() => import('./DesktopTitleBar').then(m => ({ default: m.DesktopTitleBar })))

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

  // Anchor directly to the WebView viewport. Percentage heights through
  // body/root can retain the hidden window's layout after a tray restore.
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-surface">
      <Suspense fallback={<div className="h-9 shrink-0" />}><DesktopTitleBar /></Suspense>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
