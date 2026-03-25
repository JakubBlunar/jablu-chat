import { useSyncExternalStore } from 'react'

const MOBILE_QUERY = '(max-width: 767px)'
const TABLET_QUERY = '(max-width: 1023px)'

function subscribe(query: string) {
  return (cb: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', cb)
    return () => mql.removeEventListener('change', cb)
  }
}

function getSnapshot(query: string) {
  return () => window.matchMedia(query).matches
}

const serverSnapshot = () => false

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe(MOBILE_QUERY), getSnapshot(MOBILE_QUERY), () => serverSnapshot())
}

export function useIsTablet(): boolean {
  return useSyncExternalStore(subscribe(TABLET_QUERY), getSnapshot(TABLET_QUERY), () => serverSnapshot())
}
