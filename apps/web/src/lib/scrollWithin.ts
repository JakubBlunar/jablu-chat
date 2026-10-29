/** Scroll one owned viewport without letting scrollIntoView move its ancestors. */
export function scrollWithin(
  viewport: HTMLElement | null,
  target: HTMLElement | null,
  block: 'center' | 'end' = 'center'
): void {
  if (!viewport || !target || !viewport.contains(target)) return
  const bounds = viewport.getBoundingClientRect()
  const message = target.getBoundingClientRect()
  const top = viewport.scrollTop + message.top - bounds.top - viewport.clientTop
  const offset = block === 'center' ? (viewport.clientHeight - message.height) / 2 : viewport.clientHeight - message.height
  viewport.scrollTop = Math.max(0, Math.min(top - offset, viewport.scrollHeight - viewport.clientHeight))
}
