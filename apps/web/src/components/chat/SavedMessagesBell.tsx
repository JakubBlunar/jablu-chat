import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkIcon } from '@/components/chat/chatIcons'
import { SavedMessagesList } from '@/components/chat/SavedMessagesList'
import { useNavigationStore } from '@/stores/navigation.store'

export function SavedMessagesBell({
  className = '',
  size = 'md'
}: {
  className?: string
  size?: 'sm' | 'md' | 'rail'
}) {
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState<{
    left: number
    top?: number
    bottom?: number
    height: number
  } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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
      if (
        panelRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const handleJump = (
    messageId: string,
    opts: { channelId?: string; serverId?: string; conversationId?: string }
  ) => {
    setOpen(false)
    if (opts.conversationId) {
      void useNavigationStore.getState().navigateToDm({
        conversationId: opts.conversationId,
        scrollToMessageId: messageId
      })
    } else if (opts.serverId && opts.channelId) {
      void useNavigationStore.getState().navigateToChannel({
        serverId: opts.serverId,
        channelId: opts.channelId,
        scrollToMessageId: messageId
      })
    }
  }

  const panel =
    open &&
    panelPos &&
    createPortal(
      <div
        ref={panelRef}
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
        aria-label="Saved messages"
        title="Saved messages"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex ${buttonSize} shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white ${className}`}
      >
        <BookmarkIcon className={iconSize} filled={open} />
      </button>
      {panel}
    </>
  )
}
