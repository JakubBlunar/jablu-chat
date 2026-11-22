import '@testing-library/jest-dom'
import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BottomSheet } from './BottomSheet'
import { MessageActionsMenu } from '@/components/chat/MessageActionsMenu'

beforeEach(() => {
  jest.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})
afterEach(async () => {
  await Promise.resolve()
  jest.restoreAllMocks()
})

function touchPointer(target: Element, type: string, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: 100, clientY })
  fireEvent(target, Object.assign(event, { pointerId: 1, pointerType: 'touch', isPrimary: true }))
}

it('follows a downward swipe from the handle and dismisses on release', async () => {
  const onClose = jest.fn()
  render(
    <BottomSheet open onClose={onClose}>
      Sheet contents
    </BottomSheet>
  )
  const handle = screen.getByRole('button', { name: 'close' })
  const panel = handle.parentElement
  await waitFor(() => expect(panel).toHaveClass('translate-y-0'))
  touchPointer(handle.firstElementChild!, 'pointerdown', 100)
  touchPointer(handle, 'pointermove', 180)
  expect(panel).toHaveStyle({ translate: '0 80px' })
  expect(onClose).not.toHaveBeenCalled()
  touchPointer(handle, 'pointerup', 180)
  expect(panel).toHaveClass('translate-y-full')
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it('returns after a short handle drag and ignores its click while keeping taps enabled', async () => {
  const onClose = jest.fn()
  render(
    <BottomSheet open onClose={onClose}>
      Sheet contents
    </BottomSheet>
  )
  const handle = screen.getByRole('button', { name: 'close' })
  const panel = handle.parentElement!
  await waitFor(() => expect(panel).toHaveClass('translate-y-0'))
  touchPointer(handle, 'pointerdown', 100)
  touchPointer(handle, 'pointermove', 130)
  touchPointer(handle, 'pointerup', 130)
  fireEvent.click(handle, { detail: 1 })
  expect(panel.style.translate).toBe('')
  expect(panel).toHaveClass('translate-y-0')

  touchPointer(handle, 'pointerdown', 100)
  touchPointer(handle, 'pointerup', 100)
  fireEvent.click(handle, { detail: 1 })
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it('traps Tab and outside focus, isolates the background, and restores the trigger', async () => {
  const view = (open: boolean) => (
    <>
      <button>Outside</button>
      <BottomSheet open={open} onClose={jest.fn()}>
        <button>First</button>
        <button>Last</button>
      </BottomSheet>
    </>
  )
  const { rerender } = render(view(false))
  const outside = screen.getByRole('button', { name: 'Outside' })
  outside.focus()
  rerender(view(true))
  const dialog = screen.getByRole('dialog')
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  expect(outside.parentElement?.inert).toBe(true)
  screen.getByRole('button', { name: 'Last' }).focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(screen.getByRole('button', { name: 'close' })).toHaveFocus()
  outside.focus()
  expect(dialog.contains(document.activeElement)).toBe(true)
  rerender(view(false))
  expect(outside).toHaveFocus()
  expect(outside.parentElement?.inert).not.toBe(true)
})

it('only dismisses the topmost nested sheet on Escape', async () => {
  const closeParent = jest.fn()
  const closeChild = jest.fn()
  const { rerender } = render(
    <BottomSheet open onClose={closeParent}>
      <button>Parent</button>
    </BottomSheet>
  )
  rerender(
    <BottomSheet open onClose={closeParent}>
      <button>Parent</button>
      <BottomSheet open onClose={closeChild}>
        <button>Child</button>
      </BottomSheet>
    </BottomSheet>
  )
  const childDialog = screen.getByRole('button', { name: 'Child' }).closest('[role="dialog"]')
  await waitFor(() => expect(childDialog?.contains(document.activeElement)).toBe(true))
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(closeChild).toHaveBeenCalledTimes(1))
  expect(closeParent).not.toHaveBeenCalled()
})

it('wraps focus through controls inside a picker shadow root', async () => {
  render(
    <BottomSheet open onClose={jest.fn()}>
      <div data-testid="picker" />
    </BottomSheet>
  )
  const host = screen.getByTestId('picker')
  const shadow = host.attachShadow({ mode: 'open' })
  const last = document.createElement('button')
  last.textContent = 'Last emoji'
  const hidden = document.createElement('div')
  hidden.style.display = 'none'
  hidden.append(document.createElement('button'))
  const untabbable = document.createElement('button')
  untabbable.tabIndex = -1
  shadow.append(last, hidden, untabbable)
  const close = screen.getByRole('button', { name: 'close' })
  await waitFor(() => expect(close).toHaveFocus())
  last.focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
  expect(shadow.activeElement).toBe(last)
})

it('dismisses a portaled action menu without dismissing its parent sheet', async () => {
  const closeSheet = jest.fn()
  const closeMenu = jest.fn()
  const anchorRef = createRef<HTMLButtonElement>()
  const view = (menu: boolean) => (
    <BottomSheet open onClose={closeSheet}>
      <button ref={anchorRef}>Actions</button>
      {menu && (
        <MessageActionsMenu
          anchorRef={anchorRef}
          items={[{ id: 'copy', label: 'Copy', icon: null, onClick: jest.fn() }]}
          onClose={closeMenu}
        />
      )}
    </BottomSheet>
  )
  const { rerender } = render(view(false))
  rerender(view(true))
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Copy' })).toHaveFocus())
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(closeMenu).toHaveBeenCalledTimes(1)
  expect(closeSheet).not.toHaveBeenCalled()
  fireEvent.pointerDown(document.body)
  expect(closeMenu).toHaveBeenCalledTimes(2)
})
