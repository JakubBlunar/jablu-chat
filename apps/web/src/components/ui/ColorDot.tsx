import { cn } from '@/lib/cn'

const FALLBACK_COLOR = '#99aab5'

const sizes = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
} as const

export type ColorDotProps = {
  color?: string | null
  size?: keyof typeof sizes
  className?: string
}

export function ColorDot({ color, size = 'md', className }: ColorDotProps) {
  return (
    <span
      className={cn('shrink-0 rounded-full', sizes[size], className)}
      style={{ backgroundColor: color || FALLBACK_COLOR }}
    />
  )
}
