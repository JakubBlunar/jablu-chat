import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/hooks/useFocusTrap'

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
  const searchRef = useRef({ text: '', at: 0 })
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const positioned = pos !== null
  useFocusTrap(menuRef, pos !== null, onClose)

  useLayoutEffect(() => {
    const updatePosition = (event?: Event) => {
      if (event?.target instanceof Node && menuRef.current?.contains(event.target)) return
      const anchor = anchorRef.current
      if (!anchor?.isConnected) {
        onClose()
        return
      }
      const rect = anchor.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        onClose()
        return
      }
      const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
      const height = Math.min(menuRef.current?.offsetHeight || items.length * 36 + 8, window.innerHeight * 0.7)
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= height + GAP || spaceBelow >= rect.top ? rect.bottom + GAP : rect.top - height - GAP
      setPos({ left, top: Math.max(8, Math.min(top, window.innerHeight - height - 8)) })
    }
    updatePosition()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => updatePosition())
    if (menuRef.current) observer?.observe(menuRef.current)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      observer?.disconnect()
    }
  }, [anchorRef, items.length, onClose, positioned])

  useLayoutEffect(() => {
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
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [anchorRef, onClose])

  if (!pos) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={(event) => {
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
        if (!buttons.length) return
        const current = buttons.findIndex((button) => button === document.activeElement)
        let next: number | undefined
        if (event.key === 'ArrowDown') next = (current + 1) % buttons.length
        else if (event.key === 'ArrowUp')
          next = current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = buttons.length - 1
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
          const now = Date.now()
          const char = event.key.toLocaleLowerCase()
          const previous = now - searchRef.current.at < 700 ? searchRef.current.text : ''
          const text = previous === char ? char : previous + char
          searchRef.current = { text, at: now }
          for (let offset = 1; offset <= buttons.length; offset++) {
            const index = (current + offset) % buttons.length
            if (items[index].label.toLocaleLowerCase().startsWith(text)) {
              next = index
              break
            }
          }
        }
        if (next !== undefined) {
          event.preventDefault()
          buttons[next].focus()
        }
      }}
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
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-white/5 max-lg:min-h-11 ${
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
