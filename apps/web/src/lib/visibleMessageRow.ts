/** The timeline renders windows in document order, including parked placeholders. */
export function visibleMessageRow(rows: NodeListOf<HTMLElement>, viewport: DOMRect, edge: 'first' | 'last') {
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const rect = rows[middle].getBoundingClientRect()
    if (edge === 'first' ? rect.bottom <= viewport.top : rect.top < viewport.bottom) low = middle + 1
    else high = middle
  }
  const row = rows[edge === 'first' ? low : low - 1]
  if (!row) return
  const bounds = row.getBoundingClientRect()
  if (bounds.bottom > viewport.top && bounds.top < viewport.bottom) return row
}
