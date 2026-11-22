/** The timeline renders windows in document order, including parked placeholders. */
export function visibleMessageRow(
  rows: NodeListOf<HTMLElement>,
  viewport: DOMRect,
  edge: 'first' | 'last',
  topInset = 0
) {
  const top = viewport.top + topInset
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const rect = rows[middle].getBoundingClientRect()
    if (edge === 'first' ? rect.bottom <= top : rect.top < viewport.bottom) low = middle + 1
    else high = middle
  }
  const row = rows[edge === 'first' ? low : low - 1]
  if (!row) return
  const bounds = row.getBoundingClientRect()
  if (bounds.bottom > top && bounds.top < viewport.bottom) return row
}

/** A hit test usually finds the reading line without visiting any rows. */
export function firstReadingRow(container: HTMLElement, viewport: DOMRect, inset: number) {
  const hit = document
    .elementFromPoint?.(viewport.left + viewport.width / 2, viewport.top + inset)
    ?.closest<HTMLElement>('[data-message-window]')
  if (hit && container.contains(hit)) return hit
  return visibleMessageRow(container.querySelectorAll('[data-message-window]'), viewport, 'first', inset)
}
