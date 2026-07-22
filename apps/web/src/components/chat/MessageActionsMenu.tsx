import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export type MessageMenuItem = {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  danger?: boolean
}

const MENU_WIDTH = 208
const GAP = 6

/**
 * Labeled dropdown for message "more actions", anchored to a trigger button.
 * Portals to the document body, flips above/below based on available space, and
 * closes on outside pointerdown, Escape, or item selection.
 */
export function MessageActionsMenu({
  anchorRef,
  items,
  onClose
}: {
  anchorRef: RefObject<HTMLElement | null>
  items: MessageMenuItem[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    let left = rect.right - MENU_WIDTH
    if (left < 8) left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)
    left = Math.max(8, left)

    // Estimate menu height to decide flip direction (row ~36px + padding).
    const estHeight = items.length * 36 + 8
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow >= estHeight + GAP || spaceBelow >= rect.top) {
      setPos({ left, top: rect.bottom + GAP })
    } else {
      setPos({ left, bottom: window.innerHeight - rect.top + GAP })
    }
  }, [anchorRef, items.length])

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [anchorRef, onClose])

  if (!pos) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH }}
      className="fixed z-[300] max-h-[70vh] overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onClick()
            onClose()
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-white/5 ${
            item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-200'
          }`}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}
