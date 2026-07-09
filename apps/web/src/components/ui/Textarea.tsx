import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { controlBase, fieldLabelClass } from './controlStyles'

const textareaBase = cn(controlBase, 'min-h-[80px] resize-none py-2')

export type TextareaProps = {
  label?: string
  error?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, id, ...rest },
  ref,
) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className={fieldLabelClass}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={cn(textareaBase, error && 'ring-red-500 focus:ring-red-500', className)}
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
