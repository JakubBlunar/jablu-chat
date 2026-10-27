import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useSuggestionScroll } from './hooks/useSuggestionScroll'

export function SuggestionList<T>({
  items,
  getKey,
  selectedIndex,
  onSelect,
  label,
  renderItem,
  size = 'standard'
}: {
  items: T[]
  getKey: (item: T) => string
  selectedIndex: number
  onSelect: (item: T) => void
  label: string
  renderItem: (item: T) => ReactNode
  size?: 'standard' | 'wide'
}) {
  const ref = useSuggestionScroll(selectedIndex, items.length)
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      className={cn(
        'absolute bottom-full left-0 z-50 mb-1 overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10',
        size === 'wide' ? 'max-h-64 w-80' : 'max-h-52 w-72'
      )}
    >
      {items.map((item, index) => (
        <button
          key={getKey(item)}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(item)
          }}
          onClick={(event) => {
            if (event.detail === 0) onSelect(item)
          }}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition',
            index === selectedIndex ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/5'
          )}
        >
          {renderItem(item)}
        </button>
      ))}
    </div>
  )
}
