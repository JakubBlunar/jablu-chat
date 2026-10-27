import type { ReactNode } from 'react'
import { Button } from './Button'

export function PaginationControls({
  page,
  pages,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  pageLabel,
  previousContent,
  nextContent,
  disabled = false,
  size = 'xs'
}: {
  page: number
  pages: number
  onPrevious: () => void
  onNext: () => void
  previousLabel: string
  nextLabel: string
  pageLabel?: ReactNode
  previousContent?: ReactNode
  nextContent?: ReactNode
  disabled?: boolean
  size?: 'xs' | 'sm'
}) {
  return (
    <>
      <Button
        type="button"
        size={size}
        variant="secondary"
        aria-label={previousLabel}
        disabled={disabled || page <= 1}
        onClick={onPrevious}
      >
        {previousContent ?? previousLabel}
      </Button>
      <span className="whitespace-nowrap text-xs text-gray-400">
        {pageLabel ?? (
          <>
            {page} / {pages}
          </>
        )}
      </span>
      <Button
        type="button"
        size={size}
        variant="secondary"
        aria-label={nextLabel}
        disabled={disabled || page >= pages}
        onClick={onNext}
      >
        {nextContent ?? nextLabel}
      </Button>
    </>
  )
}
