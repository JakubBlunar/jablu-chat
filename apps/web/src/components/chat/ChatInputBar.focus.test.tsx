import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInputBar } from './ChatInputBar'

let mockIsMobile = true
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => mockIsMobile }))

afterEach(() => jest.restoreAllMocks())

it('focuses a touch tap without scrolling the page and retains the default caret action', async () => {
  const user = userEvent.setup()
  render(<ChatInputBar value="Draft text" onChange={jest.fn()} onSend={jest.fn()} placeholder="Message" />)
  const input = screen.getByRole('textbox')
  const focus = jest.spyOn(input, 'focus')
  const down = jest.fn((event: MouseEvent) => expect(event.defaultPrevented).toBe(false))
  document.addEventListener('mousedown', down, { once: true })
  await user.pointer([
    { keys: '[TouchA>]', target: input },
    { keys: '[/TouchA]', target: input }
  ])
  expect(input).toHaveFocus()
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(down).toHaveBeenCalledTimes(1)
})

it('reserves the touch Send slot even when empty and enables it for attachments', () => {
  const props = { value: '', onChange: jest.fn(), onSend: jest.fn(), placeholder: 'Message' }
  const { rerender } = render(<ChatInputBar {...props} />)
  const send = screen.getByRole('button', { name: 'sendMessage' })
  expect(send).toBeDisabled()
  rerender(<ChatInputBar {...props} hasAttachments />)
  expect(send).toBeEnabled()
})

it('opens formatting explicitly and returns keyboard focus to the draft', async () => {
  mockIsMobile = false
  try {
    const user = userEvent.setup()
    const change = jest.fn()
    render(<ChatInputBar value="words" onChange={change} onSend={jest.fn()} placeholder="Message" />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.click(input)
    expect(screen.queryByRole('group')).toBeNull()
    input.setSelectionRange(0, 5)
    await user.tab()
    await user.keyboard('{Enter}')
    await user.click(screen.getByTitle('formatting.spoiler'))
    expect(change).toHaveBeenCalledWith('||words||')
    await user.keyboard('{Escape}')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('group')).toBeNull()
  } finally {
    mockIsMobile = true
  }
})
