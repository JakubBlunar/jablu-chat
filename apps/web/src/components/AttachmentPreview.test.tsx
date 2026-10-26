import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Attachment } from '@chat/shared'
import { AttachmentPreview } from './AttachmentPreview'
import { api } from '@/lib/api'

const open = jest.fn()
jest.mock('@/components/media/MessageMediaGallery', () => ({ useMessageMedia: () => ({ openByKey: open }) }))

const photo: Attachment = { id: 'image', messageId: null, filename: 'Photo', url: '/api/uploads/attachments/full.jpg', thumbnailUrl: '/api/uploads/thumbnails/small.webp',
  type: 'image', mimeType: 'image/jpeg', sizeBytes: 7000000, width: 3600, height: 2400, thumbnailWidth: 896, thumbnailHeight: 597 }

afterEach(() => { api.baseUrl = ''; jest.clearAllMocks() })

it('requests an appropriate preview on desktop and opens the original gallery item', () => {
  api.baseUrl = 'https://chat.example'
  render(<AttachmentPreview attachment={photo} />)
  expect(screen.getByAltText('Photo')).toHaveAttribute('src', 'https://chat.example/api/uploads/thumbnails/small.webp')
  expect(screen.getByAltText('Photo')).toHaveAttribute('srcset', 'https://chat.example/api/uploads/thumbnails/small.webp 896w, https://chat.example/api/uploads/attachments/full.jpg 3600w')
  fireEvent.load(screen.getByAltText('Photo'))
  fireEvent.click(screen.getByRole('button', { name: 'Photo' }))
  expect(open).toHaveBeenCalledWith('image')
})

it('uses legacy thumbnail dimensions without claiming they are a 2x preview', () => {
  render(<AttachmentPreview attachment={{ ...photo, thumbnailWidth: null, thumbnailHeight: null }} />)
  expect(screen.getByAltText('Photo')).toHaveAttribute('srcset', '/api/uploads/thumbnails/small.webp 400w, /api/uploads/attachments/full.jpg 3600w')
})

it.each(['gif', 'legacy-webp'])('retains animated originals for %s attachments', kind => {
  render(<AttachmentPreview attachment={{ ...photo, type: kind === 'gif' ? 'gif' : 'image', mimeType: 'image/webp', thumbnailWidth: null }} />)
  expect(screen.getByAltText('Photo')).toHaveAttribute('src', photo.url)
})
