import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

/** Shared by `<Input />` and raw `<input />` that should match settings/forms focus. */
export const inputFieldClassNames =
  'w-full rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:opacity-50'

export type InputProps = {
  label?: string
  error?: string
} & React.InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...rest },
  ref,
) {
  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(inputFieldClassNames, error && 'ring-red-500 focus:ring-red-500', className)}
        {...rest}
      />
      {error && (
        <p className="mt-1 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
