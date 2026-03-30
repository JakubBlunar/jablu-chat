import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

const textareaBase =
  'w-full rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none'

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
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
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
