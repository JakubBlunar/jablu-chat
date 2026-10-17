import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { PanelResizeHandle } from './PanelResizeHandle'

it('supports keyboard resizing, bounds and reset on either edge', () => {
  const onChange = jest.fn()
  const onReset = jest.fn()
  const view = (edge: 'left' | 'right') => (
    <PanelResizeHandle
      label="Panel width"
      value={320}
      min={280}
      max={400}
      edge={edge}
      onChange={onChange}
      onReset={onReset}
    />
  )
  const { rerender } = render(view('right'))
  const handle = screen.getByRole('separator', { name: 'Panel width' })
  expect(handle).toHaveAttribute('aria-valuenow', '320')
  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenLastCalledWith(336)
  rerender(view('left'))
  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenLastCalledWith(304)
  fireEvent.keyDown(handle, { key: 'Home' })
  expect(onChange).toHaveBeenLastCalledWith(280)
  fireEvent.keyDown(handle, { key: 'End' })
  expect(onChange).toHaveBeenLastCalledWith(400)
  fireEvent.doubleClick(handle)
  expect(onReset).toHaveBeenCalledTimes(1)
})

it('restores body interaction styles when a drag is interrupted by unmounting', () => {
  const previous = Object.getOwnPropertyDescriptor(window, 'PointerEvent')
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
  document.body.style.cursor = 'crosshair'
  document.body.style.userSelect = 'text'
  const onChange = jest.fn()
  const { unmount } = render(
    <PanelResizeHandle
      label="Panel width"
      value={320}
      min={280}
      max={400}
      edge="right"
      onChange={onChange}
      onReset={jest.fn()}
    />
  )
  const handle = screen.getByRole('separator')
  handle.setPointerCapture = jest.fn()
  fireEvent.pointerDown(handle, { button: 0, clientX: 100 })
  fireEvent.pointerMove(handle, { clientX: 300 })
  expect(onChange).toHaveBeenLastCalledWith(400)
  expect(document.body.style.cursor).toBe('col-resize')
  unmount()
  expect(document.body.style.cursor).toBe('crosshair')
  expect(document.body.style.userSelect).toBe('text')
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (previous) Object.defineProperty(window, 'PointerEvent', previous)
  else Reflect.deleteProperty(window, 'PointerEvent')
})
