import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '@/hooks/useMobile'
import { BottomSheet } from './BottomSheet'

/** Actions are independent of their trigger and presentation. Submenus use the
 * same action model on desktop and touch, without requiring hover. */
export type ContextMenuItem =
  | { id: string; separator: true; label?: string }
  | {
      id: string
      label: string
      icon?: ReactNode
      disabled?: boolean
      danger?: boolean
      checked?: boolean
      onSelect?: () => void
      children?: ContextMenuItem[]
      slider?: { value: number; min: number; max: number; onChange: (value: number) => void }
    }

type Anchor = { x: number; y: number; touch: boolean; sequence: number }
let closeOpenMenu: (() => void) | null = null

function claimMenu(close: () => void) {
  closeOpenMenu?.()
  closeOpenMenu = close
}

function releaseMenu(close: () => void) {
  if (closeOpenMenu === close) closeOpenMenu = null
}

export function ContextMenu({
  label,
  items,
  children,
  openOnClick = false,
  disabled = false
}: {
  label: string
  items: ContextMenuItem[]
  children: ReactElement<HTMLAttributes<HTMLElement>>
  openOnClick?: boolean
  disabled?: boolean
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const trigger = useRef<HTMLElement | null>(null)
  const sequence = useRef(0)
  const finishOpeningTouch = useCallback((event: TouchEvent) => {
    // The original finger is still down when the sheet appears. Its release
    // must not synthesize a click on the new backdrop or an action beneath it.
    if (event.cancelable) event.preventDefault()
    document.removeEventListener('touchend', finishOpeningTouch, true)
    document.removeEventListener('touchcancel', finishOpeningTouch, true)
  }, [])
  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    window.removeEventListener('scroll', cancel, true)
    window.removeEventListener('blur', cancel)
    document.removeEventListener('pointerdown', cancel, true)
  }, [])
  const close = useCallback(() => {
    setAnchor(null)
    releaseMenu(close)
  }, [])
  const open = (element: HTMLElement, x: number, y: number, touch = false) => {
    if (disabled || !items.length) return
    cancel()
    trigger.current = element
    // Focus the actual trigger so both the sheet and popup restore it correctly.
    element.focus({ preventScroll: true })
    claimMenu(close)
    if (touch && start.current) {
      document.addEventListener('touchend', finishOpeningTouch, { capture: true, passive: false })
      document.addEventListener('touchcancel', finishOpeningTouch, { capture: true, passive: false })
    }
    setAnchor({ x, y, touch, sequence: ++sequence.current })
  }
  useEffect(() => {
    return () => {
      cancel()
      document.removeEventListener('touchend', finishOpeningTouch, true)
      document.removeEventListener('touchcancel', finishOpeningTouch, true)
      releaseMenu(close)
    }
  }, [cancel, close, finishOpeningTouch])
  const original = children.props
  if (disabled || !items.length) return children
  return (
    <>
      {cloneElement(children, {
        'aria-haspopup': 'menu',
        'aria-expanded': !!anchor,
        tabIndex: original.tabIndex ?? (children.type === 'div' || children.type === 'span' ? -1 : undefined),
        onContextMenu: (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (suppressClick.current) return
          const touch = start.current !== null
          if (touch) suppressClick.current = true
          open(event.currentTarget, event.clientX, event.clientY, touch)
        },
        onKeyDown: (event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            open(event.currentTarget, rect.left, rect.bottom)
          } else original.onKeyDown?.(event)
        },
        onPointerDown: (event) => {
          cancel()
          suppressClick.current = false
          original.onPointerDown?.(event)
          if (event.pointerType !== 'touch' || !event.isPrimary) return
          event.stopPropagation()
          start.current = { x: event.clientX, y: event.clientY }
          window.addEventListener('scroll', cancel, true)
          window.addEventListener('blur', cancel)
          document.addEventListener('pointerdown', cancel, true)
          const element = event.currentTarget
          const { clientX: x, clientY: y } = event
          timer.current = setTimeout(() => {
            suppressClick.current = true
            open(element, x, y, true)
          }, 500)
        },
        onPointerMove: (event) => {
          if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8)
            cancel()
          original.onPointerMove?.(event)
        },
        onPointerUp: (event) => {
          cancel()
          start.current = null
          original.onPointerUp?.(event)
        },
        onPointerCancel: (event) => {
          cancel()
          start.current = null
          original.onPointerCancel?.(event)
        },
        onClick: (event) => {
          if (suppressClick.current) {
            event.preventDefault()
            event.stopPropagation()
            suppressClick.current = false
            return
          }
          if (openOnClick) {
            const rect = event.currentTarget.getBoundingClientRect()
            if (anchor) close()
            else open(event.currentTarget, rect.left, rect.bottom)
          } else original.onClick?.(event)
        },
        style: { ...original.style, WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties
      })}
      {anchor && (
        <ActionMenu
          key={anchor.sequence}
          label={label}
          items={items}
          anchor={anchor}
          onClose={close}
          trigger={trigger.current}
        />
      )}
    </>
  )
}

function ActionMenu({
  label,
  items,
  anchor,
  onClose,
  trigger
}: {
  label: string
  items: ContextMenuItem[]
  anchor: Anchor
  onClose: () => void
  trigger: HTMLElement | null
}) {
  const { t } = useTranslation('common')
  const mobile = useIsMobile() || anchor.touch
  const ref = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState<string[]>([])
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y })
  let current = items
  let title = label
  for (const id of path) {
    const item = current.find((entry) => entry.id === id)
    if (item && !('separator' in item) && item.children) {
      current = item.children
      title = item.label
    }
  }
  useLayoutEffect(() => {
    if (mobile) return
    const menu = ref.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8))
    })
    menu.querySelector<HTMLElement>('[data-menu-control]:not(:disabled)')?.focus()
  }, [anchor.x, anchor.y, mobile, path])
  useEffect(() => {
    if (mobile) return
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const close = () => onClose()
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !ref.current?.contains(document.activeElement)) return
      // Handle this before an owning dialog's document-level focus trap.
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
      trigger?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('keydown', escape, true)
    }
  }, [mobile, onClose, trigger])
  useEffect(
    () => () => {
      // Do not steal focus from a dialog opened by an action or an outside click.
      if (document.activeElement === document.body) trigger?.focus({ preventScroll: true })
    },
    [trigger]
  )
  const content = (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      className={
        mobile
          ? 'px-2 pb-2'
          : 'fixed z-[200] w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg bg-surface-darkest p-1.5 text-sm shadow-2xl ring-1 ring-white/10'
      }
      style={mobile ? undefined : { ...position, maxHeight: 'calc(100dvh - 16px)' }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          trigger?.focus()
          return
        }
        if (event.key === 'Tab' && !mobile) {
          onClose()
          trigger?.focus()
          return
        }
        if (event.key === 'ArrowLeft' && path.length) {
          event.preventDefault()
          setPath(path.slice(0, -1))
          return
        }
        if (
          event.target instanceof HTMLInputElement &&
          ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)
        )
          return
        const controls = Array.from(
          ref.current?.querySelectorAll<HTMLElement>('[data-menu-control]:not(:disabled)') ?? []
        )
        const index = controls.indexOf(document.activeElement as HTMLElement)
        let next = -1
        if (event.key === 'ArrowDown') next = (index + 1) % controls.length
        if (event.key === 'ArrowUp') next = (index - 1 + controls.length) % controls.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = controls.length - 1
        if (next >= 0) {
          event.preventDefault()
          controls[next]?.focus()
        }
        if (event.key === 'ArrowRight') {
          const item = current.find(
            (entry) => entry.id === (document.activeElement as HTMLElement | null)?.dataset.menuControl
          )
          if (item && !('separator' in item) && item.children) {
            event.preventDefault()
            setPath([...path, item.id])
          }
        }
      }}
    >
      <div role="presentation" className="px-3 py-2 text-xs font-semibold text-gray-400">
        {title}
      </div>
      {path.length > 0 && (
        <button
          type="button"
          role="menuitem"
          data-menu-control="back"
          className="w-full rounded px-3 py-2 text-left text-gray-300 hover:bg-white/10 focus:bg-white/10"
          onClick={() => setPath(path.slice(0, -1))}
        >
          <span aria-hidden>← </span>
          {t('back')}
        </button>
      )}
      {current.map((item, index) =>
        'separator' in item ? (
          <div key={item.id} role="presentation">
            {index > 0 && <div role="separator" className="my-1 border-t border-white/10" />}
            {item.label && (
              <div
                role="presentation"
                className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
              >
                {item.label}
              </div>
            )}
          </div>
        ) : item.slider ? (
          <div key={item.id} role="none" className="px-3 py-2">
            <label className="flex flex-col gap-2 text-sm text-gray-200">
              <span className="flex justify-between gap-3">
                <span>{item.label}</span>
                <span>{item.slider.value}%</span>
              </span>
              <input
                data-menu-control={item.id}
                type="range"
                min={item.slider.min}
                max={item.slider.max}
                value={item.slider.value}
                disabled={item.disabled}
                aria-label={item.label}
                aria-valuetext={`${item.slider.value}%`}
                onChange={(event) => item.slider?.onChange(Number(event.target.value))}
                className="w-full accent-primary"
              />
            </label>
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            aria-haspopup={item.children ? 'menu' : undefined}
            disabled={item.disabled}
            data-menu-control={item.id}
            className={`flex w-full items-center gap-2 rounded px-3 text-left text-sm outline-none transition hover:bg-white/10 focus:bg-white/10 disabled:opacity-40 ${mobile ? 'min-h-11 py-3' : 'py-2'} ${item.danger ? 'text-red-400' : 'text-gray-200'}`}
            onClick={() => {
              if (item.children) setPath([...path, item.id])
              else {
                onClose()
                item.onSelect?.()
              }
            }}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.checked ? <span aria-hidden>✓</span> : null}
            {item.children ? <span aria-hidden>›</span> : null}
          </button>
        )
      )}
    </div>
  )
  return mobile ? (
    <BottomSheet open onClose={onClose} aria-label={label} zIndex={200}>
      {content}
    </BottomSheet>
  ) : (
    createPortal(content, trigger?.closest('[role="dialog"]') ?? document.body)
  )
}
