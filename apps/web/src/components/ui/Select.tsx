import { forwardRef } from 'react'
import { Select as HSelect } from '@headlessui/react'
import { cn } from '@/lib/cn'
import { controlBase, controlSizes, fieldLabelClass, type ControlSize } from './controlStyles'

function ChevronIcon() {
  return (
    <svg
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

export type SelectProps = {
  label?: string
  error?: string
  size?: ControlSize
  /** Classes for the outer wrapper (e.g. to constrain width for inline use). */
  wrapperClassName?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, size = 'md', className, wrapperClassName, id, children, ...rest },
  ref,
) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} className={fieldLabelClass}>
          {label}
        </label>
      )}
      <div className="relative">
        <HSelect
          ref={ref}
          id={id}
          className={cn(
            controlBase,
            controlSizes[size],
            'cursor-pointer appearance-none pr-9',
            error && 'ring-red-500 focus:ring-red-500',
            className
          )}
          {...rest}
        >
          {children}
        </HSelect>
        <ChevronIcon />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
