import { useEffect } from 'react'
import { startDesktopUpdateSync } from '@/stores/desktopUpdate.store'

/** Keeps the desktop updater store in sync with native events for the app lifetime. */
export function useDesktopUpdateSync() {
  useEffect(() => startDesktopUpdateSync(), [])
}
