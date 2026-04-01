import type { UserStatus } from '@chat/shared'
import { cn } from '@/lib/cn'

export const statusColors: Record<UserStatus, string> = {
  online: 'bg-emerald-500',
  idle: 'bg-amber-400',
  dnd: 'bg-red-500',
  offline: 'bg-zinc-500',
}

const sizes = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
} as const

export type StatusDotProps = {
  status: UserStatus
  size?: keyof typeof sizes
  className?: string
}

export function StatusDot({ status, size = 'xs', className }: StatusDotProps) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full', sizes[size], statusColors[status], className)}
      aria-hidden
    />
  )
}
