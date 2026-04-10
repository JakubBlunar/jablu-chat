import { cn } from '@/lib/cn'

type Level = 'all' | 'mentions' | 'none'

/** Source / channel notification level. Muted keeps bell-strike; other levels use sliders (distinct from inbox bell). */
export function ChannelNotifPrefTriggerIcon({ level, className }: { level: Level; className?: string }) {
  if (level === 'none') {
    return (
      <svg className={cn('h-5 w-5', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg className={cn('h-5 w-5', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <line x1="4" y1="21" x2="4" y2="14" strokeLinecap="round" />
      <line x1="4" y1="10" x2="4" y2="3" strokeLinecap="round" />
      <line x1="12" y1="21" x2="12" y2="12" strokeLinecap="round" />
      <line x1="12" y1="8" x2="12" y2="3" strokeLinecap="round" />
      <line x1="20" y1="21" x2="20" y2="16" strokeLinecap="round" />
      <line x1="20" y1="12" x2="20" y2="3" strokeLinecap="round" />
      <line x1="1" y1="14" x2="7" y2="14" strokeLinecap="round" />
      <line x1="9" y1="8" x2="15" y2="8" strokeLinecap="round" />
      <line x1="17" y1="16" x2="23" y2="16" strokeLinecap="round" />
    </svg>
  )
}
