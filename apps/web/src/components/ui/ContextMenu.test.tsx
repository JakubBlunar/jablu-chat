import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { ModalOverlay } from './ModalOverlay'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

function touch(element: Element, type = 'pointerDown', extra: object = {}) {
  const event = new Event(
    type.replace(/[A-Z]/g, (letter) => letter.toLowerCase()),
    { bubbles: true, cancelable: true }
  )
  Object.assign(event, { pointerType: 'touch', isPrimary: true, clientX: 20, clientY: 20, ...extra })
  fireEvent(element, event)
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('portals outside clipping, fits the viewport, navigates by keyboard, and restores focus', () => {
  const selected = jest.fn()
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 256, 160))
  const { container } = render(
    <div style={{ overflow: 'hidden' }}>
      <ContextMenu
        label="Server"
        items={[
          { id: 'disabled', label: 'Disabled', disabled: true },
          { id: 'first', label: 'First', onSelect: selected },
          { id: 'second', label: 'Second' }
        ]}
      >
        <button>Server</button>
      </ContextMenu>
    </div>
  )
  const trigger = screen.getByRole('button', { name: 'Server' })
  fireEvent.contextMenu(trigger, { clientX: 10000, clientY: 10000 })
  const menu = screen.getByRole('menu')
  expect(container).not.toContainElement(menu)
  expect(menu).toHaveStyle({ left: `${window.innerWidth - 264}px`, top: `${window.innerHeight - 168}px` })
  expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus()
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(screen.getByRole('menuitem', { name: 'Second' })).toHaveFocus()
  fireEvent.keyDown(menu, { key: 'Home' })
  expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus()
  fireEvent.keyDown(menu, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(selected).not.toHaveBeenCalled()
  fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
  fireEvent.click(screen.getByRole('menuitem', { name: 'First' }))
  expect(selected).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('opens only one menu, dismisses outside, and supports click-triggered menus', () => {
  const items: ContextMenuItem[] = [{ id: 'action', label: 'Action' }]
  render(
    <>
      <ContextMenu label="First" items={items}>
        <button>First</button>
      </ContextMenu>
      <ContextMenu label="Second" items={items} openOnClick>
        <button>Second</button>
      </ContextMenu>
    </>
  )
  fireEvent.contextMenu(screen.getByRole('button', { name: 'First' }))
  fireEvent.click(screen.getByRole('button', { name: 'Second' }))
  expect(screen.getAllByRole('menu')).toHaveLength(1)
  expect(screen.getByRole('menu', { name: 'Second' })).toBeInTheDocument()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('long press opens a sheet and suppresses navigation and duplicate native menus', () => {
  const click = jest.fn()
  render(
    <ContextMenu label="Server" items={[{ id: 'action', label: 'Action' }]}>
      <button onClick={click}>Server</button>
    </ContextMenu>
  )
  const trigger = screen.getByRole('button', { name: 'Server' })
  touch(trigger)
  act(() => jest.advanceTimersByTime(500))
  expect(screen.getByRole('dialog', { name: 'Server' })).toBeInTheDocument()
  act(() => jest.advanceTimersByTime(500))
  fireEvent.touchEnd(screen.getByRole('dialog', { name: 'Server' }))
  act(() => jest.advanceTimersByTime(250))
  expect(screen.getByRole('menu')).toBeInTheDocument()
  fireEvent.contextMenu(trigger)
  expect(screen.getAllByRole('menu')).toHaveLength(1)
  touch(trigger, 'pointerUp')
  fireEvent.click(trigger)
  expect(click).not.toHaveBeenCalled()
})

it.each(['move', 'cancel', 'scroll', 'second-touch', 'unmount'])('cancels long press on %s', (reason) => {
  const { unmount } = render(
    <ContextMenu label="Server" items={[{ id: 'action', label: 'Action' }]}>
      <button>Server</button>
    </ContextMenu>
  )
  const trigger = screen.getByRole('button', { name: 'Server' })
  touch(trigger)
  if (reason === 'move') touch(trigger, 'pointerMove', { clientX: 40 })
  if (reason === 'cancel') touch(trigger, 'pointerCancel')
  if (reason === 'scroll') fireEvent.scroll(window)
  if (reason === 'second-touch') touch(trigger, 'pointerDown', { isPrimary: false })
  if (reason === 'unmount') unmount()
  act(() => jest.advanceTimersByTime(600))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('uses the touch sheet even if the browser contextmenu arrives before the hold timer', () => {
  const click = jest.fn()
  render(
    <ContextMenu label="Server" items={[{ id: 'action', label: 'Action' }]}>
      <button onClick={click}>Server</button>
    </ContextMenu>
  )
  const trigger = screen.getByRole('button', { name: 'Server' })
  touch(trigger)
  fireEvent.contextMenu(trigger)
  touch(trigger, 'pointerUp')
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Server' })).toBeInTheDocument()
  expect(click).not.toHaveBeenCalled()
})

it('keeps nested triggers and touch slider interactions from opening the parent menu', () => {
  function Example() {
    const [value, setValue] = useState(100)
    return (
      <ContextMenu label="Parent" items={[{ id: 'parent', label: 'Parent action' }]}>
        <div>
          <ContextMenu
            label="Child"
            items={[
              { id: 'volume', label: 'Volume', slider: { min: 0, max: 200, value, onChange: setValue } },
              { id: 'folder', label: 'Folders', children: [{ id: 'games', label: 'Games' }] }
            ]}
          >
            <button>Child</button>
          </ContextMenu>
        </div>
      </ContextMenu>
    )
  }
  render(<Example />)
  touch(screen.getByRole('button', { name: 'Child' }))
  act(() => jest.advanceTimersByTime(500))
  const slider = screen.getByRole('slider', { name: 'Volume' })
  touch(slider)
  fireEvent.change(slider, { target: { value: '150' } })
  act(() => jest.advanceTimersByTime(600))
  expect(screen.getByRole('slider')).toHaveValue('150')
  expect(screen.getAllByRole('menu')).toHaveLength(1)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Folders' }))
  expect(screen.getByRole('menuitem', { name: 'Games' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: 'back' }))
  expect(screen.getByRole('slider')).toHaveValue('150')
})

it('keeps desktop menus inside the owning dialog focus scope', () => {
  const closeDialog = jest.fn()
  render(
    <ModalOverlay onClose={closeDialog} aria-label="Settings">
      <ContextMenu label="Server" items={[{ id: 'action', label: 'Action' }]}>
        <button>Server</button>
      </ContextMenu>
    </ModalOverlay>
  )
  act(() => jest.advanceTimersByTime(20))
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Server' }))
  expect(screen.getByRole('dialog', { name: 'Settings' })).toContainElement(screen.getByRole('menu'))
  expect(screen.getByRole('menuitem', { name: 'Action' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Action' }), { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(closeDialog).not.toHaveBeenCalled()
})
