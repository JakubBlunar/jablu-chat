import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Message } from '@chat/shared'
import { GroupedMessageRow } from './GroupedMessageRow'
import { api } from '@/lib/api'
import { toggleGroupedReaction } from '@/lib/reactions'

jest.mock('@/lib/reactions', () => ({ toggleGroupedReaction: jest.fn(async () => true) }))
jest.mock('@/lib/api', () => ({ api: { get: jest.fn() } }))
jest.mock('@/components/UserAvatar', () => ({ UserAvatar: () => null }))
jest.mock('@/lib/serverProfile', () => ({ useServerDisplayName: (author: { username: string }) => author.username }))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: 'me' } })
}))
jest.mock('@/stores/server.store', () => ({
  useServerStore: (select: (state: unknown) => unknown) => select({ currentServerId: null })
}))
jest.mock('@/stores/emoji.store', () => ({ useEmojiStore: () => [], buildNameMap: () => new Map(), EMPTY_EMOJIS: [] }))
jest.mock('./MessageRow', () => ({ MessageRow: ({ message }: { message: Message }) => <p>{message.content}</p> }))
jest.mock('./ReactionPill', () => ({
  ReactionPill: ({ reaction, onToggle }: { reaction: { emoji: string; count: number }; onToggle: () => void }) => (
    <button onClick={onToggle}>
      {reaction.emoji} {reaction.count}
    </button>
  )
}))
jest.mock('./ReactionDetailsModal', () => ({ ReactionDetailsModal: () => null }))

const message = (id: string, userIds: string[], usersComplete = true): Message =>
  ({
    id,
    authorId: id,
    author: { id, username: id, avatarUrl: null },
    content: 'same',
    createdAt: '2026-11-07T12:34:01Z',
    reactions: [{ emoji: '🎉', count: usersComplete ? userIds.length : 100, userIds, isCustom: false, usersComplete }]
  }) as Message
const props = { mode: 'channel' as const, contextId: 'context', onReply: jest.fn(), onJumpToMessage: jest.fn() }

beforeEach(() => jest.clearAllMocks())

it('keeps a large group compact and expands the full author list on demand', () => {
  const messages = Array.from({ length: 10 }, (_, index) => message(`Person ${index}`, []))
  render(<GroupedMessageRow {...props} messages={messages} />)
  expect(screen.getByRole('button', { name: 'Person 0' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Person 9' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'jinx.morePeople' }))
  expect(screen.getByRole('button', { name: 'Person 9' })).toBeInTheDocument()
})

it('shows one shared body and unique reaction counts; a click targets all originals', async () => {
  const messages = [message('a', ['me', 'friend']), message('b', ['friend', 'other'])]
  render(<GroupedMessageRow {...props} messages={messages} />)
  expect(screen.getAllByText('same')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '🎉 3' }))
  await waitFor(() =>
    expect(toggleGroupedReaction).toHaveBeenCalledWith({ mode: 'channel', messages, emoji: '🎉', isCustom: false })
  )
})

it('loads every page for incomplete previews before exposing an exact shared count', async () => {
  jest
    .mocked(api.get)
    .mockResolvedValueOnce({ userIds: ['me', 'friend'], nextCursor: 'next' })
    .mockResolvedValueOnce({ userIds: ['other'], nextCursor: null })
  render(<GroupedMessageRow {...props} messages={[message('a', ['me'], false), message('b', ['friend', 'fourth'])]} />)
  expect(screen.queryByRole('button', { name: /🎉/ })).toBeNull()
  await screen.findByRole('button', { name: '🎉 4' })
  expect(api.get).toHaveBeenCalledTimes(2)
  expect(jest.mocked(api.get).mock.calls[1][0]).toContain('after=next')
})

it('offers retry after a failed union fetch instead of displaying sampled counts', async () => {
  jest
    .mocked(api.get)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ userIds: ['a', 'b'], nextCursor: null })
  render(<GroupedMessageRow {...props} messages={[message('a', ['a'], false), message('b', ['b'])]} />)
  const retry = await screen.findByRole('button', { name: 'retry' })
  expect(screen.queryByRole('button', { name: /🎉/ })).toBeNull()
  fireEvent.click(retry)
  await screen.findByRole('button', { name: '🎉 2' })
})
