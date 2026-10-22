import '@testing-library/jest-dom'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MessageActionsMenu } from './MessageActionsMenu'

function setup() {
  const anchorRef = createRef<HTMLButtonElement>()
  const onClose = jest.fn()
  const items = ['Reply', 'Copy text', 'Copy link', 'Delete'].map((label) => ({
    id: label,
    label,
    icon: null,
    onClick: jest.fn()
  }))
  render(
    <>
      <button ref={anchorRef}>More</button>
      <MessageActionsMenu anchorRef={anchorRef} onClose={onClose} items={items} />
    </>
  )
  return { anchor: anchorRef.current!, onClose, items }
}

it('supports wrapping arrows, Home, End, and type-ahead cycling', () => {
  setup()
  const items = screen.getAllByRole('menuitem')
  items[0].focus()
  fireEvent.keyDown(items[0], { key: 'ArrowUp' })
  expect(items[3]).toHaveFocus()
  fireEvent.keyDown(items[3], { key: 'ArrowDown' })
  expect(items[0]).toHaveFocus()
  fireEvent.keyDown(items[0], { key: 'End' })
  expect(items[3]).toHaveFocus()
  fireEvent.keyDown(items[3], { key: 'Home' })
  expect(items[0]).toHaveFocus()
  fireEvent.keyDown(items[0], { key: 'c' })
  expect(items[1]).toHaveFocus()
  fireEvent.keyDown(items[1], { key: 'c' })
  expect(items[2]).toHaveFocus()
})

it('updates its anchor position on resize and captured scrolling', () => {
  const { anchor } = setup()
  let right = 400
  jest.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => ({
    right,
    left: right - 30,
    top: 100,
    bottom: 130,
    x: right - 30,
    y: 100,
    width: 30,
    height: 30,
    toJSON: () => ({})
  }))
  fireEvent(window, new Event('resize'))
  expect(screen.getByRole('menu')).toHaveStyle({ left: '192px' })
  right = 500
  fireEvent(window, new Event('scroll'))
  expect(screen.getByRole('menu')).toHaveStyle({ left: '292px' })
})

it('runs only the selected action and closes', () => {
  const { items, onClose } = setup()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reply' }))
  expect(items[0].onClick).toHaveBeenCalledTimes(1)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('includes links in keyboard navigation and supports Space activation', () => {
  const anchorRef = createRef<HTMLButtonElement>()
  const onClose = jest.fn()
  render(
    <>
      <button ref={anchorRef}>More</button>
      <MessageActionsMenu
        anchorRef={anchorRef}
        onClose={onClose}
        items={[
          { id: 'reply', label: 'Reply', icon: null, onClick: jest.fn() },
          { id: 'open', label: 'Open Link', icon: null, href: 'https://example.com', separatorBefore: true }
        ]}
      />
    </>
  )
  const open = screen.getByRole('menuitem', { name: 'Open Link' })
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Reply' }), { key: 'End' })
  expect(open).toHaveFocus()
  const clicked = jest.fn((event: Event) => event.preventDefault())
  open.addEventListener('click', clicked)
  fireEvent.keyDown(open, { key: ' ' })
  expect(clicked).toHaveBeenCalledTimes(1)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('keeps a popup inside its owning dialog and makes it interactive', () => {
  const anchorRef = createRef<HTMLButtonElement>()
  render(
    <div role="dialog" style={{ pointerEvents: 'none' }}>
      <button ref={anchorRef}>More</button>
      <MessageActionsMenu
        anchorRef={anchorRef}
        onClose={jest.fn()}
        items={[{ id: 'reply', label: 'Reply', icon: null, onClick: jest.fn() }]}
      />
    </div>
  )
  expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('menu'))
  expect(screen.getByRole('menu')).toHaveClass('pointer-events-auto')
  expect(screen.getByRole('menuitem')).toHaveFocus()
})

it('dismisses on Tab without trapping keyboard navigation', () => {
  const { anchor, onClose } = setup()
  fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Tab' })
  expect(onClose).toHaveBeenCalled()
  expect(anchor).toHaveFocus()
})
