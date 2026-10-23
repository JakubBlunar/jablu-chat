import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { DmCallLayout } from './DmCallLayout'

jest.mock('@/components/voice/VoiceRoom', () => ({ VoiceRoom: () => <div>Active call</div> }))

it('keeps the same message composer and draft when chat is hidden or the call ends', async () => {
  const view = (active: boolean, chatOpen: boolean) => (
    <DmCallLayout active={active} chatOpen={chatOpen} chatId="call-chat">
      <input aria-label="Message" defaultValue="" />
    </DmCallLayout>
  )
  const { rerender } = render(view(false, true))
  const composer = screen.getByRole('textbox')
  fireEvent.change(composer, { target: { value: 'Unsent draft' } })
  rerender(view(true, true))
  await screen.findByText('Active call')
  expect(screen.getByRole('textbox')).toBe(composer)
  expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  rerender(view(true, false))
  expect(composer).not.toBeVisible()
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  expect(screen.getByText('Active call')).toBeVisible()
  rerender(view(true, true))
  expect(screen.getByRole('textbox')).toHaveValue('Unsent draft')
  rerender(view(false, false))
  expect(screen.getByRole('textbox')).toBe(composer)
  expect(composer).toBeVisible()
  expect(screen.queryByText('Active call')).not.toBeInTheDocument()
})

it('resizes with the keyboard, keeps its size across chat toggles, and resets on double click', () => {
  const view = (chatOpen: boolean) => (
    <DmCallLayout active chatOpen={chatOpen} chatId="call-chat">
      Messages
    </DmCallLayout>
  )
  const { rerender } = render(view(true))
  const handle = screen.getByRole('separator')
  fireEvent.keyDown(handle, { key: 'ArrowDown' })
  expect(handle).toHaveAttribute('aria-valuenow', '50')
  fireEvent.keyDown(handle, { key: 'ArrowUp' })
  expect(handle).toHaveAttribute('aria-valuenow', '45')
  fireEvent.keyDown(handle, { key: 'Home' })
  expect(handle).toHaveAttribute('aria-valuenow', '30')
  fireEvent.keyDown(handle, { key: 'ArrowUp' })
  expect(handle).toHaveAttribute('aria-valuenow', '30')
  fireEvent.keyDown(handle, { key: 'End' })
  fireEvent.keyDown(handle, { key: 'ArrowDown' })
  expect(handle).toHaveAttribute('aria-valuenow', '70')
  rerender(view(false))
  rerender(view(true))
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '70')
  fireEvent.doubleClick(screen.getByRole('separator'))
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '45')
})

it.each(['hide', 'end', 'unmount', 'cancel', 'release', 'lost capture'])(
  'supports pointer resizing and restores interaction after %s',
  (finish) => {
    const previous = Object.getOwnPropertyDescriptor(window, 'PointerEvent')
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
    const { container, rerender, unmount } = render(
      <DmCallLayout active chatOpen chatId="call-chat">
        Messages
      </DmCallLayout>
    )
    Object.defineProperty(container.firstChild, 'clientHeight', { value: 612 })
    const handle = screen.getByRole('separator')
    Object.defineProperty(handle, 'offsetHeight', { value: 12 })
    handle.setPointerCapture = jest.fn()
    document.body.style.cursor = 'crosshair'
    document.body.style.userSelect = 'text'
    fireEvent.pointerDown(handle, { button: 0, clientY: 100 })
    fireEvent.pointerMove(handle, { clientY: 160 })
    expect(handle).toHaveAttribute('aria-valuenow', '55')
    fireEvent.pointerMove(handle, { clientY: 1000 })
    expect(handle).toHaveAttribute('aria-valuenow', '70')
    expect(document.body.style.cursor).toBe('row-resize')
    if (finish === 'hide')
      rerender(
        <DmCallLayout active chatOpen={false} chatId="call-chat">
          Messages
        </DmCallLayout>
      )
    else if (finish === 'end')
      rerender(
        <DmCallLayout active={false} chatOpen chatId="call-chat">
          Messages
        </DmCallLayout>
      )
    else if (finish === 'unmount') unmount()
    else if (finish === 'cancel') fireEvent.pointerCancel(handle)
    else if (finish === 'release') fireEvent.pointerUp(handle)
    else fireEvent.lostPointerCapture(handle)
    expect(document.body.style.cursor).toBe('crosshair')
    expect(document.body.style.userSelect).toBe('text')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (previous) Object.defineProperty(window, 'PointerEvent', previous)
    else Reflect.deleteProperty(window, 'PointerEvent')
  }
)
