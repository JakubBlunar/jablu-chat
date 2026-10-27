import { cn } from '@/lib/cn'

const variants = {
  error: 'bg-red-500/10 text-red-400',
  warning: 'bg-yellow-500/10 text-yellow-400',
  success: 'bg-green-500/10 text-green-400',
  info: 'bg-blue-500/10 text-blue-400'
} as const

const prominentVariants = {
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-100'
} as const

export type InlineAlertProps = {
  variant: keyof typeof variants
  children: React.ReactNode
  className?: string
  prominent?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export function InlineAlert({ variant, children, className, prominent, ...rest }: InlineAlertProps) {
  return (
    <div
      className={cn(
        'rounded-md px-3 py-2',
        prominent ? cn('border text-sm', prominentVariants[variant]) : cn('text-xs', variants[variant]),
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
