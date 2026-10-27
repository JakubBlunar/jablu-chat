export function minutesToTimeValue(m: number): string {
  const h = Math.min(23, Math.max(0, Math.floor(m / 60)))
  const min = Math.min(59, Math.max(0, m % 60))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
export function timeValueToMinutes(s: string): number {
  const [a, b] = s.split(':')
  const h = parseInt(a ?? '0', 10)
  const min = parseInt(b ?? '0', 10)
  if (!Number.isFinite(h) || !Number.isFinite(min)) return 0
  return Math.min(1439, Math.max(0, h * 60 + min))
}
