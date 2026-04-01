import { cn } from '@/lib/cn'

const FALLBACK_COLOR = '#9ca3af'

export type TagChipProps = {
  name: string
  color?: string | null
  active?: boolean
  onClick?: () => void
  onRemove?: () => void
  className?: string
}

export function TagChip({
  name,
  color,
  active,
  onClick,
  onRemove,
  className,
}: TagChipProps) {
  const resolved = color || FALLBACK_COLOR

  if (onRemove) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[10px] font-medium text-white',
          className,
        )}
        style={{ backgroundColor: `${resolved}33`, borderColor: `${resolved}99` }}
      >
        <span>{name}</span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-sm px-1 text-gray-300 hover:bg-black/20 hover:text-white"
          aria-label={`Remove ${name}`}
        >
          x
        </button>
      </span>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
          active
            ? 'border-transparent text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]'
            : 'border-white/10 hover:border-white/20 hover:text-white',
          className,
        )}
        style={
          active
            ? { backgroundColor: resolved }
            : { backgroundColor: 'rgba(255,255,255,0.06)', color: resolved, borderColor: color ? `${color}66` : undefined }
        }
      >
        {name}
      </button>
    )
  }

  return (
    <span
      className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', className)}
      style={{ backgroundColor: color ? `${color}30` : 'rgba(255,255,255,0.1)', color: resolved }}
    >
      {name}
    </span>
  )
}
