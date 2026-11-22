import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBackGestureClose } from '@/hooks/useBackGestureClose'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface Props {
  title: string
  detailTitle: string
  tab: string
  directTab?: string
  returnToCaller?: boolean
  closeLabel: string
  backLabel: string
  onClose: () => void
  className: string
  index: (openDetail: () => void) => ReactNode
  children: ReactNode
}

export function MobileSettingsShell({
  title,
  detailTitle,
  tab,
  directTab,
  returnToCaller,
  closeLabel,
  backLabel,
  onClose,
  className,
  index,
  children
}: Props) {
  const [indexOpen, setIndexOpen] = useState(!directTab)
  const dialog = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const visitedDetail = useRef(false)
  const selectedFromIndex = useRef(false)
  const back = () => (indexOpen || returnToCaller ? onClose() : setIndexOpen(true))
  useFocusTrap(dialog, true, back)
  useBackGestureClose(true, onClose)
  useBackGestureClose(!indexOpen && !returnToCaller, () => setIndexOpen(true))

  useEffect(() => {
    if (directTab) setIndexOpen(false)
  }, [directTab])
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!indexOpen) {
        visitedDetail.current = true
        heading.current?.focus({ preventScroll: true })
      } else if (visitedDetail.current) {
        const row = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[data-settings-key]') ?? []).find(
          (button) => button.dataset.settingsKey === tab
        )
        if (row && !selectedFromIndex.current) row.scrollIntoView({ block: 'nearest' })
        ;(row ?? heading.current)?.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [indexOpen, tab])

  return (
    <div ref={dialog} className={className} role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex min-h-12 shrink-0 items-center border-b border-white/10 px-3">
        <button
          type="button"
          onClick={back}
          aria-label={indexOpen || returnToCaller ? closeLabel : backLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-white"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 ref={heading} tabIndex={-1} className="ml-2 text-base font-semibold text-white">
          {indexOpen ? title : detailTitle}
        </h1>
      </div>
      <div ref={list} hidden={!indexOpen} className="min-h-0 flex-1 overflow-y-auto">
        {index(() => {
          selectedFromIndex.current = true
          setIndexOpen(false)
        })}
      </div>
      {!indexOpen && (
        <div key={tab} className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  )
}
