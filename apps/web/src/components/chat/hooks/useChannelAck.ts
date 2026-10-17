import { useEffect, type RefObject } from 'react'
import { isAppFocused, subscribeAppVisibility } from '@/lib/appVisibility'
import { useReadStateStore } from '@/stores/readState.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

export function useChannelAck(
  mode: 'channel' | 'dm',
  contextId: string | null,
  { ready, atBottom, scrollParentRef }: {
    ready: boolean
    atBottom: boolean
    scrollParentRef: RefObject<HTMLDivElement | null>
  }
): void {
  const readState = useReadStateStore((s) =>
    contextId ? (mode === 'channel' ? s.channels : s.dms).get(contextId) : undefined
  )

  useEffect(() => {
    if (!contextId) return
    const rs = useReadStateStore.getState()
    if (mode === 'channel') rs.captureChannelView(contextId)
    else rs.captureDmView(contextId)
  }, [mode, contextId, readState])

  useEffect(() => {
    if (mode === 'dm' && contextId) useReadStateStore.getState().resumeDmAck(contextId)
  }, [mode, contextId])

  useEffect(() => {
    return () => {
      if (!contextId) return
      const rs = useReadStateStore.getState()
      if (mode === 'channel') rs.clearChannelView(contextId)
      else rs.clearDmView(contextId)
    }
  }, [mode, contextId])

  useEffect(() => {
    if (!contextId || !ready || !atBottom) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const canRead = () => {
      const el = scrollParentRef.current
      return isAppFocused() && !useVoiceConnectionStore.getState().viewingVoiceRoom &&
        !(mode === 'dm' && useReadStateStore.getState().pausedDmAcks.has(contextId)) &&
        !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 30
    }
    const schedule = () => {
      clearTimeout(timer)
      if (!canRead()) return
      timer = setTimeout(() => {
        if (!canRead()) return
        const rs = useReadStateStore.getState()
        void (mode === 'channel' ? rs.ackChannel(contextId) : rs.ackDm(contextId))
      }, 250)
    }
    schedule()
    const unsubscribe = subscribeAppVisibility(schedule)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [mode, contextId, readState, ready, atBottom, scrollParentRef])
}
