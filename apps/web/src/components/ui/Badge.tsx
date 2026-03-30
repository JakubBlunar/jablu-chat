import { cn } from '@/lib/cn'

const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

const variants = {
  default: 'bg-white/10 text-gray-300',
  primary: 'bg-primary/20 text-primary',
  success: 'bg-emerald-500/20 text-emerald-400',
  danger: 'bg-red-500/20 text-red-400',
  warning: 'bg-amber-500/20 text-amber-400',
  info: 'bg-blue-500/20 text-blue-400',
} as const

export type BadgeProps = {
  variant?: keyof typeof variants
  className?: string
  children: React.ReactNode
}

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  return <span className={cn(base, variants[variant], className)}>{children}</span>
}
