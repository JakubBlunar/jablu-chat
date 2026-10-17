import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConversationLinksList } from './ConversationLinksList'
import { api } from '@/lib/api'
jest.mock('@/lib/api', () => ({ api: { getDmLinks: jest.fn() } }))

it('shows link titles, URL-only links and jumps to the source message', async () => {
  jest.mocked(api.getDmLinks).mockResolvedValue({
    items: [
      {
        messageId: 'old',
        createdAt: '2026-10-17T10:00:00Z',
        authorName: 'Alice',
        links: [
          { url: 'https://example.com/one', title: 'Example title', description: 'Description' },
          { url: 'https://example.com/two', title: null, description: null }
        ]
      }
    ],
    total: 1
  })

  const jump = jest.fn()
  render(<ConversationLinksList conversationId="conv" onJump={jump} />)
  expect(await screen.findByRole('link', { name: /Example title/ })).toHaveAttribute('href', 'https://example.com/one')
  expect(screen.getByRole('link', { name: /https:\/\/example.com\/two/ })).toBeInTheDocument()
  fireEvent.click(screen.getByText('jumpToMessage'))
  expect(jump).toHaveBeenCalledWith('old')
  expect(api.getDmLinks).toHaveBeenCalledWith('conv', 0, 30)
})

it('explains malformed links while keeping their source messages accessible', async () => {
  jest.mocked(api.getDmLinks).mockResolvedValue({
    items: [{ messageId: 'invalid', createdAt: '2026-10-17T10:00:00Z', authorName: null, links: [] }],
    total: 1
  })
  const jump = jest.fn()
  render(<ConversationLinksList conversationId="conv" onJump={jump} />)
  expect(await screen.findByText('conversationLinksInvalid')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'jumpToMessage' }))
  expect(jump).toHaveBeenCalledWith('invalid')
})
