import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SavedMessagesList } from './SavedMessagesList'
import { api } from '@/lib/api'
import { makeMessage } from '@/test/factories'

jest.mock('simplebar-react', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
jest.mock('@/components/media/MessageMediaGallery', () => ({
  MessageMediaProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}))
jest.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>
}))
jest.mock('@/components/AttachmentPreview', () => ({ AttachmentPreview: () => null }))
jest.mock('@/components/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }))
jest.mock('@/lib/api', () => ({ api: { getBookmarks: jest.fn(), removeBookmark: jest.fn() } }))
const entry = {
  id: 'b1',
  messageId: 'm1',
  note: null,
  createdAt: '2026-01-01',
  message: makeMessage({ id: 'm1', content: 'Keep this message' })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('passes the saved reply parent through to message navigation', async () => {
  const onJump = jest.fn()
  jest.mocked(api.getBookmarks).mockResolvedValueOnce({
    bookmarks: [
      {
        ...entry,
        message: {
          ...entry.message,
          threadParentId: 'parent',
          channel: { id: 'channel', name: 'general', serverId: 'server' }
        }
      }
    ],
    hasMore: false
  })
  render(<SavedMessagesList onClose={jest.fn()} onJump={onJump} />)
  fireEvent.click(await screen.findByRole('button', { name: 'jumpToMessage' }))
  expect(onJump).toHaveBeenCalledWith(
    'm1',
    expect.objectContaining({
      serverId: 'server',
      channelId: 'channel',
      threadParentId: 'parent'
    })
  )
})

it('reports an initial error instead of claiming there are no saved messages', async () => {
  jest
    .mocked(api.getBookmarks)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ bookmarks: [entry], hasMore: false })
  render(<SavedMessagesList onClose={jest.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('savedMessagesFailed')
  expect(screen.queryByText('savedMessagesEmpty')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('retry'))
  expect(await screen.findByText('Keep this message')).toBeInTheDocument()
})

it('retains saved entries when loading another page fails and retries the same cursor', async () => {
  jest
    .mocked(api.getBookmarks)
    .mockResolvedValueOnce({ bookmarks: [entry], hasMore: true })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ bookmarks: [], hasMore: false })
  render(<SavedMessagesList onClose={jest.fn()} />)
  await screen.findByText('Keep this message')
  fireEvent.click(screen.getByText('savedLoadMore'))
  await screen.findByRole('alert')
  expect(screen.getByText('Keep this message')).toBeInTheDocument()
  fireEvent.click(screen.getByText('retry'))
  await waitFor(() => expect(api.getBookmarks).toHaveBeenLastCalledWith('b1'))
})

it('keeps a saved message when removing it fails and allows another attempt', async () => {
  jest.mocked(api.getBookmarks).mockResolvedValue({ bookmarks: [entry], hasMore: false })
  jest.mocked(api.removeBookmark).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  render(<SavedMessagesList onClose={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'actionRemoveBookmark' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('bookmarkActionFailed')
  expect(screen.getByText('Keep this message')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'actionRemoveBookmark' }))
  await waitFor(() => expect(screen.queryByText('Keep this message')).not.toBeInTheDocument())
})
