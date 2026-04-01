import { cn } from '@/lib/cn'

const FALLBACK_COLOR = 'var(--color-primary)'

const sizes = {
  sm: {
    chip: 'px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
    dot: 'h-1.5 w-1.5',
  },
  md: {
    chip: 'px-2 py-0.5 text-xs font-medium',
    dot: 'h-2 w-2',
  },
} as const

export type RoleBadgeProps = {
  name: string
  color?: string | null
  size?: keyof typeof sizes
  showDot?: boolean
  className?: string
}

export function RoleBadge({
  name,
  color,
  size = 'sm',
  showDot = true,
  className,
}: RoleBadgeProps) {
  const resolved = color || FALLBACK_COLOR
  const s = sizes[size]

  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded ring-1', s.chip, className)}
      style={{ color: resolved, borderColor: `${resolved}66` }}
    >
      {showDot && (
        <span
          className={cn('shrink-0 rounded-full', s.dot)}
          style={{ backgroundColor: resolved }}
        />
      )}
      {name}
    </span>
  )
}
