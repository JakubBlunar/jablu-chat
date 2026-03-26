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

  const size = isMobile ? 'h-11 w-11' : 'h-8 w-8'
  const icon = isMobile ? 'h-5 w-5' : 'h-4 w-4'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute bottom-3 right-3 z-10 flex items-center justify-center rounded-full bg-primary text-white shadow-lg transition active:scale-95 active:bg-primary/80 ${isMobile ? '' : 'hover:bg-primary/80'} ${size}`}
    >
      <svg className={icon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </button>
  )
})
