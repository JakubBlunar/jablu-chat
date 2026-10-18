import { useEffect, type RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useInboxStore } from '@/stores/inbox.store'

export function useInboxAnchor(
  mode: 'channel' | 'dm',
  contextId: string | null,
  threadParentId: string | null,
  scrollParentRef: RefObject<HTMLDivElement | null>,
  ready: boolean
) {
  const [readerRequest, navigated, unavailable] = useInboxStore(
    useShallow((s) => [s.reader?.requestId, s.reader?.navigated, s.reader?.group.unavailable] as const)
  )
  useEffect(() => {
    const reader = useInboxStore.getState().reader
    const container = scrollParentRef.current
    if (
      !ready ||
      !reader?.navigated ||
      reader.group.unavailable ||
      !container ||
      !reader?.sessionId ||
      reader.target.mode !== mode ||
      reader.target.contextId !== contextId ||
      reader.target.threadParentId !== threadParentId
    )
      return
    let timer: ReturnType<typeof setTimeout> | undefined
    let candidate = reader.target.messageId
    const sample = () => {
      if (useInboxStore.getState().open || useInboxStore.getState().reader?.group.unavailable || document.hidden) return
      const viewport = container.getBoundingClientRect()
      const visible = [...container.querySelectorAll<HTMLElement>('[id^="msg-"]')].find((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.bottom > viewport.top + 8 && bounds.top < viewport.bottom
      })
      const messageId = visible?.id.slice(4)
      if (!messageId || messageId === candidate) return
      candidate = messageId
      useInboxStore.getState().stageAnchor({ ...reader.target, messageId })
      clearTimeout(timer)
      timer = setTimeout(() => {
        void useInboxStore.getState().saveAnchor({ ...reader.target, messageId })
      }, 800)
    }
    container.addEventListener('scroll', sample, { passive: true })
    const flush = () => {
      clearTimeout(timer)
      if (candidate && candidate !== reader.target.messageId) {
        void useInboxStore.getState().saveAnchor({ ...reader.target, messageId: candidate })
      }
    }
    const onVisibility = () => {
      if (document.hidden) flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    sample()
    return () => {
      container.removeEventListener('scroll', sample)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [mode, contextId, threadParentId, scrollParentRef, ready, readerRequest, navigated, unavailable])
}
