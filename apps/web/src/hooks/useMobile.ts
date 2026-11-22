import { useSyncExternalStore } from 'react'

// Keep phones on the same chat shell when rotated; switching to the desktop
// shell would unmount the focused composer and its keyboard viewport tracking.
const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (orientation: landscape) and (max-width: 1023px) and (max-height: 599px)'
const TABLET_QUERY = '(max-width: 1023px)'

function breakpoint(query: string) {
  let media: MediaQueryList | undefined
  const listeners = new Set<() => void>()
  const current = () => (media ??= window.matchMedia(query))
  const notify = () => {
    for (const listener of listeners) listener()
  }
  return {
    snapshot: () => current().matches,
    subscribe(listener: () => void) {
      if (!listeners.size) current().addEventListener('change', notify)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          media?.removeEventListener('change', notify)
          media = undefined
        }
      }
    }
  }
}

const mobile = breakpoint(MOBILE_QUERY)
const tablet = breakpoint(TABLET_QUERY)
const serverSnapshot = () => false

export function useIsMobile(): boolean {
  return useSyncExternalStore(mobile.subscribe, mobile.snapshot, serverSnapshot)
}

export function useIsTablet(): boolean {
  return useSyncExternalStore(tablet.subscribe, tablet.snapshot, serverSnapshot)
}
