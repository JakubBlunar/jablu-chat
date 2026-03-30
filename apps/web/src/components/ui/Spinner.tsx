import { cn } from '@/lib/cn'

const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-4',
  xl: 'h-10 w-10 border-4',
} as const

export type SpinnerProps = {
  size?: keyof typeof sizes
  className?: string
}

export function Spinner({ size = 'lg', className }: SpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn('animate-spin rounded-full border-white/10 border-t-primary', sizes[size])}
      />
    </div>
  )
}
