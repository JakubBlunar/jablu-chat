export function horizontalGesture(dx: number, dy: number, direction: 'left' | 'right', threshold = 60) {
  return (direction === 'left' ? -dx : dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.5
}

export function isVerticalDrag(dx: number, dy: number) {
  return Math.abs(dy) > Math.abs(dx) + 8
}

// Reachable from inside the screen even when the OS takes the outer edge.
export const drawerEdgeWidth = 80

export function startsDetailsDrawerSwipe(target: EventTarget | null, x: number) {
  return x >= window.innerWidth - drawerEdgeWidth && target instanceof Element && !!target.closest('[data-details-drawer-edge]')
}

export function ownsHorizontalTouch(target: EventTarget | null, root: HTMLElement) {
  if (!(target instanceof Element)) return false
  if (target.closest('a, input, textarea, select, video, audio, [contenteditable=true], [role=slider]')) return true
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true
  }
  return false
}
