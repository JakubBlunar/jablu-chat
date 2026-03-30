import { cn } from '@/lib/cn'

const trackSizes = {
  sm: 'h-2',
  md: 'h-3',
} as const

const fillVariants = {
  primary: 'bg-primary',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  auto: '',
} as const

export type ProgressBarProps = {
  value: number
  variant?: keyof typeof fillVariants
  size?: keyof typeof trackSizes
  className?: string
}

export function ProgressBar({
  value,
  variant = 'primary',
  size = 'md',
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value))
  const autoColor =
    variant === 'auto'
      ? pct > 90
        ? 'bg-red-500'
        : pct > 70
          ? 'bg-amber-500'
          : 'bg-emerald-500'
      : fillVariants[variant]

  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-surface-darkest', trackSizes[size], className)}>
      <div
        className={cn('h-full rounded-full transition-all', autoColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
