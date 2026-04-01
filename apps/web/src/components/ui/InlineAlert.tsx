import { cn } from '@/lib/cn'

const base = 'rounded-md px-3 py-2 text-xs'

const variants = {
  error: 'bg-red-500/10 text-red-400',
  warning: 'bg-yellow-500/10 text-yellow-400',
  success: 'bg-green-500/10 text-green-400',
  info: 'bg-blue-500/10 text-blue-400',
} as const

export type InlineAlertProps = {
  variant: keyof typeof variants
  children: React.ReactNode
  className?: string
}

export function InlineAlert({ variant, children, className }: InlineAlertProps) {
  return (
    <div className={cn(base, variants[variant], className)}>
      {children}
    </div>
  )
}
