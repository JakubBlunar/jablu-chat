import '@testing-library/jest-dom'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MessageActionsMenu } from './MessageActionsMenu'

jest.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: jest.fn() }))

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
