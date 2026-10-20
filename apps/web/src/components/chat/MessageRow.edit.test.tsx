import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageRow } from './MessageRow'
import { useIsMobile } from '@/hooks/useMobile'
import { editMessage } from '@/lib/messageActions'
import { makeMessage } from '@/test/factories'

jest.mock('@/components/chat/MessageActions', () => ({
  MessageActions: ({ onEdit }: { onEdit: () => void }) => <button onClick={onEdit}>Edit</button>
}))
jest.mock('@/components/chat/MessageTranslationBlock', () => ({ MessageTranslationBlock: () => null }))
jest.mock('@/components/chat/MobileMessageDrawer', () => ({
  MobileMessageDrawer: () => <div role="dialog">Message actions</div>
}))
jest.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>
}))
jest.mock('@/components/AttachmentPreview', () => ({ AttachmentPreview: () => null }))
jest.mock('@/components/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }))
jest.mock('@/components/media/MessageMediaGallery', () => ({
  MessageMediaProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: jest.fn(() => false) }))
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ has: () => false }),
  Permission: { MANAGE_MESSAGES: 1 }
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: 'user-1' } })
}))
jest.mock('@/lib/messageActions', () => ({ editMessage: jest.fn() }))
jest.mock('@/lib/messageActionError', () => ({ messageActionError: () => 'edit failed; text retained' }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/i18n/config', () => ({ i18n: { language: 'en' } }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useIsMobile).mockReturnValue(false)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('retains edited text on failed confirmation and guards duplicate saves', async () => {
  let reject!: (error: Error) => void
  jest
    .mocked(editMessage)
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    .mockResolvedValueOnce(undefined)
  render(
    <MessageRow
      message={makeMessage()}
      mode="channel"
      contextId="channel"
      showHead
      onReply={jest.fn()}
      onJumpToMessage={jest.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const input = screen.getByRole('textbox', { name: 'editMessageText' })
  fireEvent.change(input, { target: { value: 'Keep my unsaved edit' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(editMessage).toHaveBeenCalledTimes(1)
  expect(input).toHaveAttribute('readonly')
  reject(new Error('timeout'))
  expect(await screen.findByRole('alert')).toHaveTextContent('edit failed; text retained')
  expect(input).toHaveValue('Keep my unsaved edit')
  fireEvent.click(screen.getByRole('button', { name: 'editSave' }))
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
  expect(editMessage).toHaveBeenCalledTimes(2)
})

it('does not submit while composing text with an IME', () => {
  render(
    <MessageRow
      message={makeMessage()}
      mode="channel"
      contextId="channel"
      showHead
      onReply={jest.fn()}
      onJumpToMessage={jest.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const input = screen.getByRole('textbox', { name: 'editMessageText' })
  fireEvent.change(input, { target: { value: 'Composing' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(editMessage).not.toHaveBeenCalled()
})

it.each([null, 'webhook-1'])('renders the automated sender identity with webhookId %s', (webhookId) => {
  const message = makeMessage({
    authorId: null,
    author: null,
    webhookId,
    webhook: { name: 'Test Server', avatarUrl: '/server-icon.png' }
  })
  render(
    <MessageRow
      message={message}
      mode="channel"
      contextId="channel"
      showHead
      onReply={jest.fn()}
      onJumpToMessage={jest.fn()}
    />
  )

  expect(screen.getByText('Test Server')).toBeInTheDocument()
  expect(screen.getByTitle('Test Server').querySelector('img')).toHaveAttribute('src', '/server-icon.png')
  expect(screen.getByText('BOT')).toBeInTheDocument()
  expect(screen.queryByText('deletedUser')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Test Server' })).not.toBeInTheDocument()
})

it('keeps the deleted-user label for messages without an automated sender identity', () => {
  const message = makeMessage({ authorId: null, author: null, webhookId: null, webhook: null })
  render(
    <MessageRow
      message={message}
      mode="channel"
      contextId="channel"
      showHead
      onReply={jest.fn()}
      onJumpToMessage={jest.fn()}
    />
  )

  expect(screen.getByText('deletedUser')).toBeInTheDocument()
  expect(screen.queryByText('BOT')).not.toBeInTheDocument()
})

describe('reply preview navigation', () => {
  function renderReply(mode: 'channel' | 'dm' = 'channel', content = 'Original message') {
    const original = { id: 'original', content, author: { id: 'author', username: 'Original author' } }
    const onJumpToMessage = jest.fn()
    const onReply = jest.fn()
    const onUserClick = jest.fn()
    render(
      <MessageRow
        message={makeMessage({ replyToId: original.id, replyTo: original })}
        mode={mode}
        contextId="context"
        showHead
        onReply={onReply}
        onJumpToMessage={onJumpToMessage}
        onUserClick={onUserClick}
      />
    )
    return {
      onJumpToMessage,
      onReply,
      onUserClick,
      preview: screen.getByRole('button', { name: 'jumpToMessage' }),
      authorButton: screen.getByRole('button', { name: '@Original author' })
    }
  }

  it.each(['channel', 'dm'] as const)('jumps to the original message in %s mode', (mode) => {
    const { onJumpToMessage, onReply, onUserClick, preview } = renderReply(mode)
    fireEvent.click(preview)
    expect(onJumpToMessage).toHaveBeenCalledTimes(1)
    expect(onJumpToMessage).toHaveBeenCalledWith('original')
    expect(onReply).not.toHaveBeenCalled()
    expect(onUserClick).not.toHaveBeenCalled()
  })

  it.each(['channel', 'dm'] as const)('opens the quoted author profile without jumping in %s mode', (mode) => {
    const { onJumpToMessage, onUserClick, authorButton } = renderReply(mode)
    const rect = new DOMRect(20, 30, 100, 20)
    jest.spyOn(authorButton, 'getBoundingClientRect').mockReturnValue(rect)
    fireEvent.click(authorButton)
    expect(onUserClick).toHaveBeenCalledTimes(1)
    expect(onUserClick).toHaveBeenCalledWith('author', rect)
    expect(onJumpToMessage).not.toHaveBeenCalled()
    expect(authorButton.closest('button')).toBe(authorButton)
    expect(authorButton.parentElement?.closest('button')).toBeNull()
  })

  it.each(['{Enter}', ' '])('supports keyboard profile activation with %s without jumping', async (key) => {
    const user = userEvent.setup()
    const { onJumpToMessage, onUserClick, authorButton } = renderReply()
    const rect = authorButton.getBoundingClientRect()
    authorButton.focus()
    await user.keyboard(key)
    expect(onUserClick).toHaveBeenCalledTimes(1)
    expect(onUserClick).toHaveBeenCalledWith('author', rect)
    expect(onJumpToMessage).not.toHaveBeenCalled()
  })

  it.each(['{Enter}', ' '])('supports keyboard activation with %s', async (key) => {
    const user = userEvent.setup()
    const { onJumpToMessage, preview } = renderReply()
    preview.focus()
    expect(preview).toHaveFocus()
    await user.keyboard(key)
    expect(onJumpToMessage).toHaveBeenCalledTimes(1)
    expect(onJumpToMessage).toHaveBeenCalledWith('original')
  })

  it('also navigates to attachment-only originals', () => {
    const { onJumpToMessage, preview } = renderReply('channel', '')
    expect(preview).toHaveTextContent('[attachment]')
    fireEvent.click(preview)
    expect(onJumpToMessage).toHaveBeenCalledTimes(1)
    expect(onJumpToMessage).toHaveBeenCalledWith('original')
  })

  it('shows the quoted author avatar and mention above the sender header', () => {
    render(
      <MessageRow
        message={makeMessage({
          replyToId: 'original',
          replyTo: {
            id: 'original',
            content: 'Quoted message',
            author: { id: 'author', username: 'original', displayName: 'Original author', avatarUrl: '/original.png' }
          }
        })}
        mode="channel"
        contextId="channel"
        showHead
        onReply={jest.fn()}
        onJumpToMessage={jest.fn()}
        replyAuthorRoleColor="#12ab34"
      />
    )
    const preview = screen.getByRole('button', { name: 'jumpToMessage' })
    expect(preview.parentElement).toHaveTextContent('@Original author')
    expect(preview.parentElement?.querySelector('img')).toHaveAttribute('src', '/original.png')
    expect(screen.getByText('@Original author')).toHaveStyle({ color: '#12ab34' })
    expect(preview.compareDocumentPosition(screen.getByRole('button', { name: 'testuser' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it.each(['channel', 'dm'] as const)(
    'uses larger message avatars without changing preview avatar size in %s',
    (mode) => {
      renderReply(mode)
      expect(screen.getByTitle('testuser')).toHaveClass('h-12', 'w-12')
      expect(screen.getByTitle('Original author')).toHaveClass('h-4', 'w-4')
    }
  )

  it('retains a readable preview for a deleted author', () => {
    render(
      <MessageRow
        message={makeMessage({
          replyToId: 'original',
          replyTo: { id: 'original', content: 'Quoted message', author: null }
        })}
        mode="channel"
        contextId="channel"
        showHead
        onReply={jest.fn()}
        onJumpToMessage={jest.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'jumpToMessage' }).parentElement).toHaveTextContent('deletedUser')
    expect(screen.queryByRole('button', { name: 'deletedUser' })).not.toBeInTheDocument()
  })

  it('does not render a jump button when the reply preview is unavailable', () => {
    render(
      <MessageRow
        message={makeMessage({ replyToId: 'deleted', replyTo: null })}
        mode="channel"
        contextId="channel"
        showHead
        onReply={jest.fn()}
        onJumpToMessage={jest.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'jumpToMessage' })).not.toBeInTheDocument()
  })

  it('supports tapping the preview on mobile', () => {
    jest.mocked(useIsMobile).mockReturnValue(true)
    const { onJumpToMessage, preview } = renderReply()
    fireEvent.touchStart(preview)
    fireEvent.touchEnd(preview)
    fireEvent.click(preview)
    expect(onJumpToMessage).toHaveBeenCalledTimes(1)
    expect(onJumpToMessage).toHaveBeenCalledWith('original')
  })

  it('supports tapping the quoted author on mobile without jumping', () => {
    jest.mocked(useIsMobile).mockReturnValue(true)
    const { onUserClick, onJumpToMessage, authorButton } = renderReply()
    fireEvent.touchStart(authorButton)
    fireEvent.touchEnd(authorButton)
    fireEvent.click(authorButton)
    expect(onUserClick).toHaveBeenCalledTimes(1)
    expect(onJumpToMessage).not.toHaveBeenCalled()
  })

  it('does not open a profile after long-pressing the quoted author', () => {
    jest.useFakeTimers()
    jest.mocked(useIsMobile).mockReturnValue(true)
    try {
      const { onUserClick, onJumpToMessage, authorButton } = renderReply()
      fireEvent.touchStart(authorButton)
      act(() => jest.advanceTimersByTime(500))
      fireEvent.touchEnd(authorButton)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(authorButton)
      expect(onUserClick).not.toHaveBeenCalled()
      expect(onJumpToMessage).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not navigate after a long press opens the mobile action drawer', () => {
    jest.useFakeTimers()
    jest.mocked(useIsMobile).mockReturnValue(true)
    try {
      const { onJumpToMessage, preview } = renderReply()
      fireEvent.touchStart(preview)
      act(() => jest.advanceTimersByTime(500))
      fireEvent.touchEnd(preview)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(preview)
      expect(onJumpToMessage).not.toHaveBeenCalled()
      fireEvent.click(preview)
      expect(onJumpToMessage).toHaveBeenCalledTimes(1)
      expect(onJumpToMessage).toHaveBeenCalledWith('original')
    } finally {
      jest.mocked(useIsMobile).mockReturnValue(false)
      jest.useRealTimers()
    }
  })
})
