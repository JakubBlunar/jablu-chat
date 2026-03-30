import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

const base = 'inline-flex items-center justify-center shrink-0 transition disabled:opacity-50'

const variants = {
  ghost: 'text-gray-400 hover:bg-white/10 hover:text-white',
  danger: 'text-gray-400 hover:text-red-400',
} as const

const sizes = {
  sm: 'rounded p-1',
  md: 'rounded p-1.5',
  lg: 'rounded-md p-2',
} as const

export type IconButtonProps = {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  label: string
  active?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, active, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        base,
        variants[variant],
        sizes[size],
        active && 'bg-white/10 text-white',
        className,
      )}
      {...rest}
    />
  )
})
