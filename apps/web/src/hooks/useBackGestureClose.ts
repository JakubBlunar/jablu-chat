import { useEffect, useRef } from 'react'

type OverlayState = { jablu_overlay_id: number } | null

type Entry = {
  id: number
  onClose: () => void
}

const stack: Entry[] = []
let nextId = 0
let suppressBack = false
let listenerAttached = false

function ensureListener(): void {
  if (listenerAttached) return
  if (typeof window === 'undefined') return
  listenerAttached = true
  window.addEventListener('popstate', () => {
    if (suppressBack) {
      suppressBack = false
      return
    }
    const top = stack.pop()
    if (top) top.onClose()
  })
}

function currentOverlayId(): number | null {
  if (typeof window === 'undefined') return null
  const state = window.history.state as OverlayState
  if (state && typeof state === 'object' && typeof state.jablu_overlay_id === 'number') {
    return state.jablu_overlay_id
  }
  return null
}

/**
 * Make a mobile overlay (drawer, modal, sheet, ...) respond to the browser/system
 * back gesture by closing instead of navigating the history stack.
 *
 * On open, a synthetic history entry is pushed. The browser back button, iOS edge
 * swipe, and Android system back all dispatch `popstate`, which pops the top entry
 * from a shared stack and invokes its `onClose`.
 *
 * On programmatic close (tap backdrop / ESC / X), the synthetic entry is cleaned
 * up. If a foreign navigation (e.g. react-router push) has buried the entry, it is
 * left alone — popping back to it later is harmless because it shares the URL we
 * were on when we pushed.
 *
 * Pass `enabled={false}` (e.g. on desktop) to opt out without removing the call.
 */
export function useBackGestureClose(open: boolean, onClose: () => void, enabled = true): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open || !enabled) return
    if (typeof window === 'undefined') return

    ensureListener()

    const id = ++nextId
    const entry: Entry = {
      id,
      onClose: () => onCloseRef.current()
    }
    stack.push(entry)
    window.history.pushState({ jablu_overlay_id: id }, '')

    return () => {
      const idx = stack.indexOf(entry)
      if (idx === -1) return
      stack.splice(idx, 1)
      if (currentOverlayId() === id) {
        suppressBack = true
        window.history.back()
      }
    }
  }, [open, enabled])
}

export const __testing = {
  reset(): void {
    stack.length = 0
    nextId = 0
    suppressBack = false
  },
  getStackSize(): number {
    return stack.length
  },
  isSuppressingBack(): boolean {
    return suppressBack
  }
}
