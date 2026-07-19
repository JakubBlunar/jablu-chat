import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

export type NavHistory = {
  canGoBack: boolean
  canGoForward: boolean
  goBack: () => void
  goForward: () => void
}

/**
 * Browser-style in-app navigation history for the desktop title bar.
 *
 * React Router doesn't expose whether a forward entry exists, so we track the
 * stack of `location.key`s ourselves: PUSH truncates any forward entries and
 * appends, REPLACE swaps the current entry, and POP moves the pointer to the
 * matching key (back/forward).
 */
export function useNavHistory(): NavHistory {
  const location = useLocation()
  const navType = useNavigationType()
  const navigate = useNavigate()

  const keysRef = useRef<string[]>([location.key])
  const indexRef = useRef(0)
  const [{ index, length }, setState] = useState({ index: 0, length: 1 })

  useEffect(() => {
    const keys = keysRef.current
    const key = location.key

    if (navType === 'POP') {
      const found = keys.indexOf(key)
      if (found !== -1) {
        indexRef.current = found
      } else {
        keys.push(key)
        indexRef.current = keys.length - 1
      }
    } else if (navType === 'REPLACE') {
      keys[indexRef.current] = key
    } else {
      // PUSH: discard forward entries, then append the new location.
      keys.splice(indexRef.current + 1)
      keys.push(key)
      indexRef.current = keys.length - 1
    }

    setState({ index: indexRef.current, length: keys.length })
  }, [location.key, navType])

  return {
    canGoBack: index > 0,
    canGoForward: index < length - 1,
    goBack: () => {
      if (indexRef.current > 0) navigate(-1)
    },
    goForward: () => {
      if (indexRef.current < keysRef.current.length - 1) navigate(1)
    }
  }
}
