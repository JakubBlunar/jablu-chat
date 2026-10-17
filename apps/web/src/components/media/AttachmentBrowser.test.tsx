import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AttachmentBrowser, type AttachmentPage } from './AttachmentBrowser'

const openByKey = jest.fn()
jest.mock('./MessageMediaGallery', () => ({
  MessageMediaProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useMessageMedia: () => ({ openByKey })
}))
jest.mock('@/lib/api', () => ({ resolveMediaUrl: (url: string) => url }))
const data: AttachmentPage = { items: [{
  id: 'image-1', messageId: 'old-message', filename: 'photo.png', type: 'image', mimeType: 'image/png',
  url: '/uploads/photo.png', sizeBytes: 100, width: 20, height: 20, thumbnailUrl: null
}], total: 1 }

it('opens media and jumps to the original message', async () => {
  const loadPage = jest.fn().mockResolvedValue(data)
  const jump = jest.fn()
  render(<AttachmentBrowser kind="media" loadPage={loadPage} onJump={jump} emptyLabel="Empty" />)
  fireEvent.click(await screen.findByRole('button', { name: 'photo.png' }))
  expect(openByKey).toHaveBeenCalledWith('image-1')
  fireEvent.click(screen.getByText('jumpToMessage'))
  expect(jump).toHaveBeenCalledWith('old-message')
  expect(loadPage).toHaveBeenCalledWith(0, 30)
})

it('shows a retryable error instead of an empty state', async () => {
  const loadPage = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(data)
  render(<AttachmentBrowser kind="media" loadPage={loadPage} emptyLabel="Empty" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('conversationLoadFailed')
  expect(screen.queryByText('Empty')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('conversationRetry'))
  expect(await screen.findByRole('button', { name: 'photo.png' })).toBeInTheDocument()
})

it('ignores stale responses when the source changes', async () => {
  let resolveOld!: (page: AttachmentPage) => void
  const oldSource = jest.fn(() => new Promise<AttachmentPage>((resolve) => { resolveOld = resolve }))
  const newSource = jest.fn().mockResolvedValue({ items: [], total: 0 })
  const { rerender } = render(<AttachmentBrowser kind="media" loadPage={oldSource} emptyLabel="Empty" />)
  rerender(<AttachmentBrowser kind="media" loadPage={newSource} emptyLabel="Empty" />)
  await screen.findByText('Empty')
  resolveOld(data)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'photo.png' })).not.toBeInTheDocument())
})
