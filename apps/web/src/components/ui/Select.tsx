import { forwardRef } from 'react'
import { Select as HSelect } from '@headlessui/react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'
import { controlBase, controlSizes, fieldLabelClass, type ControlSize } from './controlStyles'

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

export type SelectProps = {
  label?: string
  error?: string
  size?: ControlSize
  loading?: boolean
  /** Classes for the outer wrapper (e.g. to constrain width for inline use). */
  wrapperClassName?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, size = 'md', loading, className, wrapperClassName, id, children, ...rest },
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
        <div aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          {loading ? <Spinner size="sm" /> : <ChevronIcon />}
        </div>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
