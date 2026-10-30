import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkIcon } from '@/components/chat/chatIcons'
import { SavedMessagesList, type SavedMessageLocation } from '@/components/chat/SavedMessagesList'
import { openConversation } from '@/lib/conversationNavigation'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackGestureClose } from '@/hooks/useBackGestureClose'
import { useLayoutStore } from '@/stores/layout.store'

export function SavedMessagesBell({
  className = '',
  size = 'md'
}: {
  className?: string
  size?: 'sm' | 'md' | 'rail'
}) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState<{
    left: number
    top?: number
    bottom?: number
    height: number
  } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open && !!panelPos, () => setOpen(false))
  useBackGestureClose(open, () => setOpen(false))

  // Anchor the dropdown to the button and clamp it within the viewport so it
  // works from the title bar, server rail, or mobile rail alike. Flips upward
  // when the trigger sits too low to fit the panel below.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const reposition = () => {
      const rect = btnRef.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 8
      const gap = 6
      const panelWidth = Math.min(window.innerWidth - 16, 384)
      const maxLeft = window.innerWidth - panelWidth - margin
      const left = Math.max(margin, Math.min(rect.right - panelWidth, maxLeft))

      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const openDown = spaceBelow >= 320 || spaceBelow >= spaceAbove
      const avail = openDown ? spaceBelow : spaceAbove
      const height = Math.min(460, avail)
      if (openDown) {
        setPanelPos({ left, top: rect.bottom + gap, height })
      } else {
        setPanelPos({ left, bottom: window.innerHeight - rect.top + gap, height })
      }
    }
    reposition()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const handleJump = (messageId: string, opts: SavedMessageLocation) => {
    setOpen(false)
    useLayoutStore.getState().closeNavDrawer()
    const target = opts.conversationId ? { kind: 'dm' as const, conversationId: opts.conversationId }
      : opts.serverId && opts.channelId ? { kind: 'channel' as const, serverId: opts.serverId, channelId: opts.channelId } : null
    if (target) void openConversation({ target, position: { kind: 'message', messageId, threadParentId: opts.threadParentId }, source: 'saved' })
  }

  const panel =
    open &&
    panelPos &&
    createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('savedMessagesTitle')}
        className="fixed z-[140] flex w-[min(100vw-16px,384px)] flex-col overflow-hidden rounded-lg border border-white/10 bg-surface-dark shadow-2xl ring-1 ring-black/40"
        style={{
          left: panelPos.left,
          top: panelPos.top,
          bottom: panelPos.bottom,
          height: panelPos.height
        }}
      >
        <SavedMessagesList onClose={() => setOpen(false)} onJump={handleJump} />
      </div>,
      document.body
    )

  const buttonSize = size === 'sm' ? 'h-7 w-7' : size === 'rail' ? 'h-9 w-9' : 'h-10 w-10'
  const iconSize = size === 'md' ? 'h-5 w-5' : 'h-[18px] w-[18px]'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={t('savedMessagesTitle')}
        title={t('savedMessagesTitle')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex ${buttonSize} shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white ${className}`}
      >
        <BookmarkIcon className={iconSize} filled={open} />
      </button>
      {panel}
    </>
  )
}
