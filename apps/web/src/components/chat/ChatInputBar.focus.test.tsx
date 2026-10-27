import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInputBar } from './ChatInputBar'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => true }))

afterEach(() => jest.restoreAllMocks())

it('focuses a touch tap without scrolling the page and retains the default caret action', async () => {
  const user = userEvent.setup()
  render(<ChatInputBar value="Draft text" onChange={jest.fn()} onSend={jest.fn()} placeholder="Message" />)
  const input = screen.getByRole('textbox')
  const focus = jest.spyOn(input, 'focus')
  const down = jest.fn((event: MouseEvent) => expect(event.defaultPrevented).toBe(false))
  document.addEventListener('mousedown', down, { once: true })
  await user.pointer([{ keys: '[TouchA>]', target: input }, { keys: '[/TouchA]', target: input }])
  expect(input).toHaveFocus()
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(down).toHaveBeenCalledTimes(1)
})
