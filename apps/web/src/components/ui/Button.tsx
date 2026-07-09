import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

const base =
  'inline-flex items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap'

const variants = {
  primary:
    'bg-primary text-primary-text hover:bg-primary-hover',
  secondary:
    'text-gray-300 hover:bg-white/5 hover:text-white',
  danger:
    'bg-red-600 text-white hover:bg-red-700',
  ghost:
    'text-gray-300 hover:bg-white/10 hover:text-white',
} as const

const sizes = {
  xs: 'h-7 rounded px-3 text-xs',
  sm: 'h-8 rounded-md px-3 text-sm',
  md: 'h-9 rounded-md px-4 text-sm',
  lg: 'h-10 rounded-md px-4 text-sm font-semibold',
} as const

export type ButtonProps = {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  loading?: boolean
  fullWidth?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <>
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  )
})
