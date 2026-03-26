import { memo, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/useMobile'

interface Props {
  atBottom: boolean
  hasNewer: boolean
  isLoading: boolean
  messageCount: number
  contextId: string | null
  onClick: () => void
}

export const ScrollToBottomButton = memo(function ScrollToBottomButton({
  atBottom,
  hasNewer,
  isLoading,
  messageCount,
  contextId,
  onClick
}: Props) {
  const isMobile = useIsMobile()
  const [suppressed, setSuppressed] = useState(false)
  const prevContextIdRef = useRef(contextId)

  useEffect(() => {
    if (contextId !== prevContextIdRef.current) {
      prevContextIdRef.current = contextId
      setSuppressed(true)
    }
  }, [contextId])

  useEffect(() => {
    if (!suppressed) return
    if (isLoading) return

    const timer = setTimeout(() => setSuppressed(false), 300)
    return () => clearTimeout(timer)
  }, [suppressed, isLoading])

  const visible = !suppressed && (!atBottom || hasNewer) && messageCount > 0
  if (!visible) return null

  if (isMobile) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="absolute bottom-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-lg active:scale-95 active:bg-primary/80"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-primary/80"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      {hasNewer ? 'Jump to present' : 'New messages'}
    </button>
  )
})
