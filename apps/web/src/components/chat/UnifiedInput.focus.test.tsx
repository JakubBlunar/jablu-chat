import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { composerKey, useDraftStore } from '@/stores/draft.store'
import { useOutboxStore } from '@/stores/outbox.store'
import { useIsMobile } from '@/hooks/useMobile'
import { ChatInputBar } from './ChatInputBar'
import { UnifiedInput } from './UnifiedInput'
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

it('adds an image and a PDF dropped over DM history to the draft without sending them', async () => {
  const previewUrl = 'blob:dropped-image'
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => previewUrl) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() })
  jest.spyOn(api, 'getMaxUploadSizeMb').mockResolvedValue(10)

  function Conversation() {
    const dropZoneRef = useRef<HTMLDivElement>(null)
    return (
      <div ref={dropZoneRef}>
        <p>Conversation history</p>
        <UnifiedInput
          contextId="drop-test"
          mode="dm"
          dropZoneRef={dropZoneRef}
          replyTarget={null}
          onCancelReply={() => {}}
          placeholder="Message"
        />
      </div>
    )
  }

  const { unmount } = render(<Conversation />)
  try {
    const history = screen.getByText('Conversation history')
    const image = new File(['image'], 'photo.png', { type: 'image/png' })
    const pdf = new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' })
    const dataTransfer = { types: ['Files'], files: [image, pdf], dropEffect: 'none' }
    expect(fireEvent.dragOver(history, { dataTransfer })).toBe(false)
    expect(dataTransfer.dropEffect).toBe('copy')
    expect(screen.getByText('dropFilesToAttach')).toBeVisible()
    expect(fireEvent.drop(history, { dataTransfer })).toBe(false)
    expect(await screen.findByRole('img', { name: 'photo.png' })).toHaveAttribute('src', previewUrl)
    expect(screen.getByText('report.pdf')).toBeVisible()
    expect(screen.queryByText('dropFilesToAttach')).not.toBeInTheDocument()
    expect(useDraftStore.getState().files[composerKey('focus-owner', 'dm', 'drop-test')]).toEqual([image, pdf])
    expect(useOutboxStore.getState().enqueue).not.toHaveBeenCalled()
  } finally {
    unmount()
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
    else Reflect.deleteProperty(URL, 'createObjectURL')
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
    else Reflect.deleteProperty(URL, 'revokeObjectURL')
  }
})
