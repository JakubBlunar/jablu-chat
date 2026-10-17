import type { ReactNode } from 'react'
import { MobileDrawer } from './MobileDrawer'

export function ResponsivePanel({
  overlay,
  onClose,
  children
}: {
  overlay: boolean
  onClose: () => void
  children: ReactNode
}) {
  return overlay ? (
    <MobileDrawer open onClose={onClose} side="right" width="w-[min(100vw,30rem)]">
      {children}
    </MobileDrawer>
  ) : (
    children
  )
}
