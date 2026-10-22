import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export type MessageMenuItem = {
  id: string
  label: string
  icon: ReactNode
  onClick?: () => void
  href?: string
  separatorBefore?: boolean
  danger?: boolean
}

const MENU_WIDTH = 208
const GAP = 6

/**
 * Shared dropdown for message "more actions" and pointer context menus.
 * Portals to the document body, flips above/below based on available space, and
 * closes on outside pointerdown, Escape, or item selection.
 */
export function MessageActionsMenu({
  anchorRef,
  position,
  items,
  onClose
}: {
  anchorRef: RefObject<HTMLElement | null>
  position?: { x: number; y: number }
  items: MessageMenuItem[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef({ text: '', at: 0 })
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const positioned = pos !== null

  useEffect(() => {
    if (!positioned) return
    const trigger = anchorRef.current
    const menu = menuRef.current
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    return () => {
      if (menu?.contains(document.activeElement) || document.activeElement === document.body)
        trigger?.focus({ preventScroll: true })
    }
  }, [positioned, anchorRef])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  useLayoutEffect(() => {
    const updatePosition = (event?: Event) => {
      if (event?.target instanceof Node && menuRef.current?.contains(event.target)) return
      if (position && event?.type === 'scroll') {
        onClose()
        return
      }
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
      const width = Math.min(MENU_WIDTH, window.innerWidth - 16)
      const left = Math.max(8, Math.min(position?.x ?? rect.right - width, window.innerWidth - width - 8))
      const height = Math.min(menuRef.current?.offsetHeight || items.length * 36 + 8, window.innerHeight * 0.7)
      const spaceBelow = window.innerHeight - rect.bottom
      const top =
        position?.y ??
        (spaceBelow >= height + GAP || spaceBelow >= rect.top ? rect.bottom + GAP : rect.top - height - GAP)
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
  }, [anchorRef, items.length, onClose, positioned, position])

  useLayoutEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        (position || !anchorRef.current?.contains(e.target as Node))
      ) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    const onFocus = (event: FocusEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('focusin', onFocus)
    }
  }, [anchorRef, onClose, position])

  if (!pos) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Tab') {
          anchorRef.current?.focus({ preventScroll: true })
          onClose()
          return
        }
        if (event.key === ' ' && event.target instanceof HTMLAnchorElement) {
          event.preventDefault()
          event.target.click()
          return
        }
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
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
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH, maxWidth: 'calc(100vw - 16px)' }}
      className="pointer-events-auto fixed z-[300] max-h-[70vh] overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
    >
      {items.map((item) => {
        const Tag = item.href ? 'a' : 'button'
        return (
          <Fragment key={item.id}>
            {item.separatorBefore && <div role="separator" className="my-1 border-t border-white/10" />}
            <Tag
              type={item.href ? undefined : 'button'}
              href={item.href}
              target={item.href ? '_blank' : undefined}
              rel={item.href ? 'noopener noreferrer' : undefined}
              referrerPolicy={item.href ? 'no-referrer' : undefined}
              role="menuitem"
              onClick={() => {
                item.onClick?.()
                onClose()
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-white/5 max-lg:min-h-11 ${
                item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-200'
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Tag>
          </Fragment>
        )
      })}
    </div>,
    anchorRef.current?.closest('[role="dialog"]') ?? document.body
  )
}
