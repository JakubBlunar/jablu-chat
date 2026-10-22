import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageRow } from './MessageRow'
import { useIsMobile } from '@/hooks/useMobile'
import { useServerStore } from '@/stores/server.store'
import { useTranslationStore } from '@/stores/translation.store'
import { copyMessageContent } from '@/lib/messageClipboard'
import { makeMessage } from '@/test/factories'

jest.mock('@/components/chat/MessageTranslationBlock', () => ({ MessageTranslationBlock: () => null }))
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
jest.mock('@/stores/auth.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useAuthStore: create(() => ({ user: { id: 'user-1' } })) }
})
jest.mock('@/lib/messageClipboard', () => ({
  copyMessageContent: jest.fn().mockResolvedValue(true),
  shareMessageLink: jest.fn()
}))
jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/i18n/config', () => ({ i18n: { language: 'en' } }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useIsMobile).mockReturnValue(false)
  useServerStore.setState({ currentServerId: 'server' })
  useTranslationStore.setState({
    fetchCapabilities: jest.fn().mockResolvedValue(undefined),
    loadPreference: jest.fn().mockResolvedValue(undefined)
  })
})

function setup(overrides: Partial<React.ComponentProps<typeof MessageRow>> = {}) {
  const message = makeMessage({ id: 'message', content: 'Message content' })
  const onReply = jest.fn()
  render(
    <MessageRow
      message={message}
      mode="channel"
      contextId="channel"
      showHead
      onReply={onReply}
      onJumpToMessage={jest.fn()}
      {...overrides}
    />
  )
  return { row: document.getElementById(`msg-${overrides.message?.id ?? message.id}`)!, onReply }
}

it.each([
  ['channel', {}],
  ['DM', { mode: 'dm' as const }],
  ['thread', { message: makeMessage({ id: 'reply', threadParentId: 'parent' }) }],
  ['forum discussion', { hideThreadAction: true, hidePinAction: true, hideBookmarkAction: true }]
])('opens the same actions from right-click and More in a %s', (_surface, overrides) => {
  const { row, onReply } = setup(overrides)
  fireEvent.click(screen.getByRole('button', { name: 'actionMore' }))
  const moreActions = screen.getAllByRole('menuitem').map((item) => item.textContent)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()

  expect(fireEvent.contextMenu(row, { clientX: 250, clientY: 150 })).toBe(false)
  expect(screen.getByRole('menu')).toHaveStyle({ left: '250px', top: '150px' })
  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(moreActions)
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionReply' }))
  expect(onReply).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('preserves forum action restrictions', () => {
  const { row } = setup({ hideThreadAction: true, hidePinAction: true, hideBookmarkAction: true })
  fireEvent.contextMenu(row)
  expect(screen.queryByRole('menuitem', { name: 'actionCreateThread' })).not.toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'actionPin' })).not.toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'actionSaveMessage' })).not.toBeInTheDocument()
})

it('does not expose editing, deletion, or pinning without permission', () => {
  const { row } = setup({ message: makeMessage({ id: 'other', authorId: 'other-user' }) })
  fireEvent.contextMenu(row)
  expect(screen.getByRole('menuitem', { name: 'actionReply' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'actionEdit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'actionDelete' })).not.toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'actionPin' })).not.toBeInTheDocument()
})

it('copies the selected message and closes', async () => {
  const { row } = setup()
  fireEvent.contextMenu(row)
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionCopyText' }))
  expect(copyMessageContent).toHaveBeenCalledWith('Message content')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
})

it('opens editing from right-click and preserves the native editor context menu', () => {
  const { row } = setup()
  fireEvent.contextMenu(row)
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionEdit' }))
  const input = screen.getByRole('textbox', { name: 'editMessageText' })
  expect(fireEvent.contextMenu(input)).toBe(true)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('keeps delete confirmation open after choosing it from right-click', () => {
  const { row } = setup()
  fireEvent.contextMenu(row)
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionDelete' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
})

it.each([{ key: 'ContextMenu' }, { key: 'F10', shiftKey: true }])(
  'opens through the keyboard and restores row focus on Escape (%j)',
  async (key) => {
    const { row } = setup()
    row.focus()
    fireEvent.keyDown(row, key)
    await waitFor(() => expect(screen.getAllByRole('menuitem')[0]).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(row).toHaveFocus()
  }
)

it('does not open a desktop menu for mobile gestures', () => {
  jest.mocked(useIsMobile).mockReturnValue(true)
  const { row } = setup()
  fireEvent.contextMenu(row)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('closes on outside interaction and when scrolling the message list', () => {
  const { row } = setup()
  fireEvent.contextMenu(row)
  fireEvent.pointerDown(row)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.contextMenu(row)
  fireEvent.scroll(window)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
