import { cn } from '@/lib/cn'

export type KbdProps = {
  children: React.ReactNode
  className?: string
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded border border-white/10 bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-gray-300',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
