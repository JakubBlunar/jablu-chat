import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/stores/auth.store'
import { useOutboxStore } from '@/stores/outbox.store'
import { useIsMobile } from '@/hooks/useMobile'
import { ChatInputBar } from './ChatInputBar'
import { useMessageComposer } from './hooks/useMessageComposer'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: jest.fn(() => false) }))
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ has: () => false }) }))
jest.mock('./useBotCommands', () => ({ useBotCommands: () => [] }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))

function Composer({ mode, threadParentId }: { mode: 'channel' | 'dm'; threadParentId?: string }) {
  const composer = useMessageComposer({
    mode,
    threadParentId,
    contextId: 'focus-test',
    placeholder: 'Message',
    replyTarget: null,
    onCancelReply: () => {}
  })
  return (
    <ChatInputBar
      ref={composer.inputRef}
      value={composer.value}
      onChange={composer.setValue}
      onSend={() => void composer.send()}
      disabled={composer.saving}
      placeholder="Message"
    />
  )
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'focus-owner' } } as never)
  jest.mocked(useIsMobile).mockReturnValue(false)
  jest.spyOn(useOutboxStore.getState(), 'enqueue').mockResolvedValue({} as never)
})
afterEach(() => jest.restoreAllMocks())

it.each([
  ['channel', undefined],
  ['dm', undefined],
  ['channel', 'parent']
] as const)('restores the %s composer after clicking Send (thread: %s)', async (mode, threadParentId) => {
  render(<Composer mode={mode} threadParentId={threadParentId} />)
  const user = userEvent.setup()
  const input = screen.getByRole('textbox')
  await user.type(input, 'First message')
  const send = screen.getByRole('button', { name: 'sendMessage' })
  const mouseDown = jest.fn((event: MouseEvent) => expect(event.defaultPrevented).toBe(true))
  document.addEventListener('mousedown', mouseDown, { once: true })
  await user.click(send)
  expect(mouseDown).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(input).toHaveFocus())
  expect(input).not.toBeDisabled()
  expect(input).toHaveValue('')
  fireEvent.change(input, { target: { value: 'Next message' } })
  expect(input).toHaveValue('Next message')
})

it('does not reopen a mobile keyboard after sending', async () => {
  jest.mocked(useIsMobile).mockReturnValue(true)
  render(<Composer mode="dm" />)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Mobile message' } })
  const send = screen.getByRole('button', { name: 'sendMessage' })
  send.focus()
  fireEvent.click(send)
  await waitFor(() => expect(input).toHaveValue(''))
  expect(input).not.toHaveFocus()
})
