import { cn } from '@/lib/cn'

const base =
  'flex items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none'

const variants = {
  danger: 'bg-red-500 text-white',
  primary: 'bg-primary text-primary-text',
} as const

const sizes = {
  sm: 'h-4 min-w-4',
  md: 'h-5 min-w-5',
} as const

export type CountBadgeProps = {
  count: number
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  max?: number
  className?: string
}

export function CountBadge({
  count,
  variant = 'danger',
  size = 'sm',
  max = 99,
  className,
}: CountBadgeProps) {
  if (count <= 0) return null
  return (
    <span className={cn(base, variants[variant], sizes[size], className)}>
      {count > max ? `${max}+` : count}
    </span>
  )
}
