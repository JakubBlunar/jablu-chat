import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui'

const VoiceRoom = lazy(() => import('@/components/voice/VoiceRoom').then((m) => ({ default: m.VoiceRoom })))
const DEFAULT_SPLIT = 45
const MIN_SPLIT = 30
const MAX_SPLIT = 70

/** Keep the conversation mounted so toggling call chat preserves drafts and scroll state. */
export function DmCallLayout({
  active,
  chatOpen,
  chatId,
  children
}: {
  active: boolean
  chatOpen: boolean
  chatId: string
  children: ReactNode
}) {
  const { t } = useTranslation('voice')
  const containerRef = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(DEFAULT_SPLIT)
  const drag = useRef<{ y: number; split: number; height: number; cursor: string; userSelect: string } | null>(null)
  const stop = useCallback(() => {
    if (!drag.current) return
    document.body.style.cursor = drag.current.cursor
    document.body.style.userSelect = drag.current.userSelect
    drag.current = null
  }, [])
  useEffect(() => stop, [stop, active, chatOpen])
  const change = (value: number) => setSplit(Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, value)))

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        hidden={!active}
        className={active ? 'flex min-h-0 shrink-0 flex-col overflow-y-auto' : 'hidden'}
        style={active ? { flex: chatOpen ? `${split} 1 0%` : '1 1 0%' } : undefined}
      >
        {active && (
          <Suspense fallback={<Spinner size="lg" />}>
            <VoiceRoom />
          </Suspense>
        )}
      </div>
      {active && chatOpen && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('resizeCallChat')}
          aria-controls={chatId}
          aria-valuemin={MIN_SPLIT}
          aria-valuemax={MAX_SPLIT}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          className="group flex h-3 shrink-0 touch-none cursor-row-resize items-center justify-center border-y border-black/20 bg-surface-dark transition-colors hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none"
          onDoubleClick={() => setSplit(DEFAULT_SPLIT)}
          onKeyDown={(event) => {
            let value: number
            if (event.key === 'ArrowUp') value = split - 5
            else if (event.key === 'ArrowDown') value = split + 5
            else if (event.key === 'Home') value = MIN_SPLIT
            else if (event.key === 'End') value = MAX_SPLIT
            else return
            event.preventDefault()
            change(value)
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !containerRef.current) return
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
            stop()
            drag.current = {
              y: event.clientY,
              split,
              height: Math.max(1, containerRef.current.clientHeight - event.currentTarget.offsetHeight),
              cursor: document.body.style.cursor,
              userSelect: document.body.style.userSelect
            }
            document.body.style.cursor = 'row-resize'
            document.body.style.userSelect = 'none'
          }}
          onPointerMove={(event) => {
            if (drag.current)
              change(drag.current.split + ((event.clientY - drag.current.y) / drag.current.height) * 100)
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
        >
          <span
            aria-hidden="true"
            className="h-1 w-10 rounded-full bg-gray-600 group-hover:bg-primary group-focus-visible:bg-primary"
          />
        </div>
      )}
      <div
        id={chatId}
        hidden={active && !chatOpen}
        className={active && !chatOpen ? 'hidden' : 'relative flex min-h-0 min-w-0 flex-col overflow-hidden'}
        style={{ flex: `${active ? 100 - split : 1} 1 0%` }}
      >
        {children}
      </div>
    </div>
  )
}
