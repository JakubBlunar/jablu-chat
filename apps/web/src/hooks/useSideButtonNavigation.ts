import { useEffect } from 'react'
import { isDesktop } from '@/lib/desktop'
import { getPttBinding } from '@/lib/micMode'
import type { NavHistory } from '@/hooks/useNavHistory'

// WebView2 maps the side mouse buttons to browser back/forward.
// MouseEvent.button: 3 = Mouse 4 (back), 4 = Mouse 5 (forward).
const BACK_BUTTON = 3
const FORWARD_BUTTON = 4

/**
 * Desktop-only: makes mouse buttons 4/5 drive in-app back/forward navigation.
 *
 * If the exact button pressed is bound to push-to-talk, it is reserved for PTT:
 * we still suppress WebView2's default navigation but don't navigate (the global
 * rdev listener handles the voice side). We always preventDefault on 3/4 so the
 * webview never performs its own history navigation.
 */
export function useSideButtonNavigation({ goBack, goForward }: Pick<NavHistory, 'goBack' | 'goForward'>) {
  useEffect(() => {
    if (!isDesktop) return

    const isPttButton = (button: number) => {
      const binding = getPttBinding()
      return binding.type === 'mouse' && binding.button === button
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== BACK_BUTTON && e.button !== FORWARD_BUTTON) return
      e.preventDefault()
      if (isPttButton(e.button)) return
      if (e.button === BACK_BUTTON) goBack()
      else goForward()
    }

    const suppress = (e: MouseEvent) => {
      if (e.button === BACK_BUTTON || e.button === FORWARD_BUTTON) e.preventDefault()
    }

    window.addEventListener('mousedown', onMouseDown, { capture: true })
    window.addEventListener('mouseup', suppress, { capture: true })
    window.addEventListener('auxclick', suppress, { capture: true })
    return () => {
      window.removeEventListener('mousedown', onMouseDown, { capture: true })
      window.removeEventListener('mouseup', suppress, { capture: true })
      window.removeEventListener('auxclick', suppress, { capture: true })
    }
  }, [goBack, goForward])
}
