import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessageRow } from './MessageRow'
import { editMessage } from '@/lib/messageActions'
import { makeMessage } from '@/test/factories'

jest.mock('@/components/chat/MessageActions', () => ({
  MessageActions: ({ onEdit }: { onEdit: () => void }) => <button onClick={onEdit}>Edit</button>
}))
jest.mock('@/components/chat/MessageTranslationBlock', () => ({ MessageTranslationBlock: () => null }))
jest.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>
}))
jest.mock('@/components/AttachmentPreview', () => ({ AttachmentPreview: () => null }))
jest.mock('@/components/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }))
jest.mock('@/components/media/MessageMediaGallery', () => ({
  MessageMediaProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
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
  render(<MessageRow message={makeMessage()} mode="channel" contextId="channel" showHead onReply={jest.fn()} />)
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
  render(<MessageRow message={makeMessage()} mode="channel" contextId="channel" showHead onReply={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const input = screen.getByRole('textbox', { name: 'editMessageText' })
  fireEvent.change(input, { target: { value: 'Composing' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(editMessage).not.toHaveBeenCalled()
})
