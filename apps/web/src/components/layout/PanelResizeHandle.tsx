import { useCallback, useEffect, useRef } from 'react'

export function PanelResizeHandle({
  label,
  value,
  min,
  max,
  edge,
  onChange,
  onReset
}: {
  label: string
  value: number
  min: number
  max: number
  edge: 'left' | 'right'
  onChange: (width: number) => void
  onReset: () => void
}) {
  const drag = useRef<{ x: number; width: number; cursor: string; userSelect: string } | null>(null)
  const direction = edge === 'right' ? 1 : -1
  const change = (width: number) => onChange(Math.round(Math.max(min, Math.min(max, width))))
  const stop = useCallback(() => {
    if (!drag.current) return
    document.body.style.cursor = drag.current.cursor
    document.body.style.userSelect = drag.current.userSelect
    drag.current = null
  }, [])
  useEffect(() => stop, [stop])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className={`absolute inset-y-0 z-30 w-2 touch-none cursor-col-resize transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 ${edge === 'right' ? '-right-1' : '-left-1'}`}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        let width: number
        if (event.key === 'ArrowLeft') width = value - 16 * direction
        else if (event.key === 'ArrowRight') width = value + 16 * direction
        else if (event.key === 'Home') width = min
        else if (event.key === 'End') width = max
        else return
        event.preventDefault()
        change(width)
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          x: event.clientX,
          width: value,
          cursor: document.body.style.cursor,
          userSelect: document.body.style.userSelect
        }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }}
      onPointerMove={(event) => {
        if (drag.current) change(drag.current.width + (event.clientX - drag.current.x) * direction)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    />
  )
}
