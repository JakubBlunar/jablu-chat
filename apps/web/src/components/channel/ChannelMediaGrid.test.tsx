import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import type { Attachment } from '@chat/shared'
import { ChannelMediaGrid } from './ChannelMediaGrid'

const openByKey = jest.fn()
jest.mock('@/components/media/MessageMediaGallery', () => ({
  MessageMediaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessageMedia: () => ({ openByKey })
}))

const getChannelAttachments = jest.fn()
jest.mock('@/lib/api', () => ({
  api: { getChannelAttachments: (...args: unknown[]) => getChannelAttachments(...args) },
  resolveMediaUrl: (u: string) => u
}))

function makeAttachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: 'att',
    messageId: 'msg',
    filename: 'file.png',
    url: '/uploads/file.png',
    type: 'image',
    mimeType: 'image/png',
    sizeBytes: 1000,
    width: 100,
    height: 100,
    thumbnailUrl: '/uploads/thumb.webp',
    ...overrides
  } as Attachment
}

describe('ChannelMediaGrid', () => {
  beforeEach(() => {
    openByKey.mockClear()
    getChannelAttachments.mockReset()
  })

  it('renders thumbnails and opens the lightbox on click', async () => {
    getChannelAttachments.mockResolvedValue({
      items: [makeAttachment({ id: 'img-1' }), makeAttachment({ id: 'img-2' })],
      total: 2
    })

    render(<ChannelMediaGrid serverId="s1" channelId="c1" />)

    const thumbs = await screen.findAllByRole('button')
    expect(thumbs).toHaveLength(2)

    fireEvent.click(thumbs[0])
    expect(openByKey).toHaveBeenCalledWith('img-1')
  })

  it('paginates when total exceeds the page size', async () => {
    getChannelAttachments.mockResolvedValue({
      items: [makeAttachment({ id: 'img-1' })],
      total: 60
    })

    render(<ChannelMediaGrid serverId="s1" channelId="c1" />)

    const nextBtn = await screen.findByText('next')
    expect(getChannelAttachments).toHaveBeenLastCalledWith('s1', 'c1', 'media', 0, 30)

    fireEvent.click(nextBtn)

    await waitFor(() =>
      expect(getChannelAttachments).toHaveBeenLastCalledWith('s1', 'c1', 'media', 1, 30)
    )
  })

  it('shows an empty state when there is no media', async () => {
    getChannelAttachments.mockResolvedValue({ items: [], total: 0 })

    render(<ChannelMediaGrid serverId="s1" channelId="c1" />)

    expect(await screen.findByText('channelMediaEmpty')).toBeInTheDocument()
  })
})
