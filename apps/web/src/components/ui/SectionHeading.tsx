import { cn } from '@/lib/cn'

export type SectionHeadingProps<T extends React.ElementType = 'p'> = {
  as?: T
  children: React.ReactNode
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

const base = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400'

export function SectionHeading<T extends React.ElementType = 'p'>({
  as,
  children,
  className,
  ...rest
}: SectionHeadingProps<T>) {
  const Comp = as || 'p'
  return (
    <Comp className={cn(base, className)} {...rest}>
      {children}
    </Comp>
  )
}
