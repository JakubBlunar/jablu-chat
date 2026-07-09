import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { controlBase, controlSizes, fieldLabelClass, type ControlSize } from './controlStyles'

/** Shared by `<Input />` and raw `<input />` that should match settings/forms focus. */
export const inputFieldClassNames = cn(controlBase, controlSizes.md)

export type InputProps = {
  label?: string
  error?: string
  size?: ControlSize
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, size = 'md', className, id, ...rest },
  ref,
) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className={fieldLabelClass}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(controlBase, controlSizes[size], error && 'ring-red-500 focus:ring-red-500', className)}
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
