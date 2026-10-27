import { useLayoutEffect, type RefObject } from 'react'

function hasKeyboardFocus() {
  const element = document.activeElement
  return (
    element instanceof HTMLElement &&
    (element.matches('input, textarea, select, [contenteditable="true"]') ||
      !!element.closest('[data-message-composer]'))
  )
}

export function getVisualViewportBounds() {
  const viewport = window.visualViewport
  // Reflowing to a pinch-zoomed viewport would fight the user's zoom/pan.
  if (!viewport || Math.abs(viewport.scale - 1) > 0.01 || viewport.height <= 0) return null
  // iOS can temporarily make innerHeight equal the visual viewport during
  // scrolling, even with the keyboard open. The document keeps layout height.
  const layoutHeight = document.documentElement.clientHeight || window.innerHeight
  const inset = Math.max(0, layoutHeight - viewport.height)
  // Standalone iOS can retain a landscape/keyboard height after rotation or
  // resume. With no editor focused, that large inset is no longer a keyboard.
  const keyboardOpen = inset > 150 && hasKeyboardFocus()
  const height = inset > 150 && !keyboardOpen ? layoutHeight : Math.min(viewport.height, layoutHeight)
  return {
    height,
    layoutHeight,
    // Safari can retain offsetTop after dismissal. Once the viewport is full
    // height again there is no remaining space in which to offset the shell.
    top: Math.max(0, Math.min(viewport.offsetTop, layoutHeight - height)),
    keyboardOpen
  }
}

/** Keep fixed mobile chat surfaces inside the area above the software keyboard. */
export function useVisualViewport(ref: RefObject<HTMLElement | null>, active = true) {
  useLayoutEffect(() => {
    const element = ref.current
    const viewport = window.visualViewport
    if (!active || !element || !viewport) return
    const previousHeight = element.style.height
    const previousTop = element.style.top
    const previousInset = element.style.getPropertyValue('--keyboard-safe-area-bottom')
    let frame = 0
    const update = () => {
      const bounds = getVisualViewportBounds()
      if (!bounds) return
      element.style.height = `${bounds.height}px`
      element.style.top = `${bounds.top}px`
      // The keyboard already covers the home-indicator area.
      if (bounds.keyboardOpen) element.style.setProperty('--keyboard-safe-area-bottom', '0px')
      else element.style.removeProperty('--keyboard-safe-area-bottom')
    }
    const afterFocus = () => {
      update()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const resetKeyboard = () => {
      // A restored page may retain focus for a keyboard that is no longer open.
      if (hasKeyboardFocus()) (document.activeElement as HTMLElement).blur()
      afterFocus()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        cancelAnimationFrame(frame)
        if (hasKeyboardFocus()) (document.activeElement as HTMLElement).blur()
      } else afterFocus()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetKeyboard()
      else afterFocus()
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('orientationchange', afterFocus)
    window.screen.orientation?.addEventListener('change', afterFocus)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('focusin', afterFocus)
    document.addEventListener('focusout', afterFocus)
    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('orientationchange', afterFocus)
      window.screen.orientation?.removeEventListener('change', afterFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('focusin', afterFocus)
      document.removeEventListener('focusout', afterFocus)
      element.style.height = previousHeight
      element.style.top = previousTop
      if (previousInset) element.style.setProperty('--keyboard-safe-area-bottom', previousInset)
      else element.style.removeProperty('--keyboard-safe-area-bottom')
    }
  }, [ref, active])
}
