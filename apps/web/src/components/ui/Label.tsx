import { cn } from '@/lib/cn'

export type LabelProps = {
  children: React.ReactNode
} & React.LabelHTMLAttributes<HTMLLabelElement>

export function Label({ children, className, ...rest }: LabelProps) {
  return (
    <label
      className={cn('block text-xs font-semibold uppercase tracking-wide text-gray-400', className)}
      {...rest}
    >
      {children}
    </label>
  )
}
