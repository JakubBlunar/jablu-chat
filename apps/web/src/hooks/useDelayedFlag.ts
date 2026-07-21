import { useEffect, useState } from 'react'

/**
 * Returns true only after `active` has stayed true for at least `delayMs`, and
 * flips back to false immediately when `active` becomes false.
 *
 * Use this to gate loading indicators so they never flash on fast operations:
 * if the work finishes within the grace period, the indicator is never shown.
 */
export function useDelayedFlag(active: boolean, delayMs = 150): boolean {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const id = window.setTimeout(() => setShown(true), delayMs)
    return () => window.clearTimeout(id)
  }, [active, delayMs])

  return shown
}
