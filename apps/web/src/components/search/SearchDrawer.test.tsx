import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { SearchDrawer } from './SearchDrawer'
import { api, ApiError, type SearchResult } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

const mockNavigate = jest.fn()
const mockGoToChannel = jest.fn()
const mockGoToDm = jest.fn()
const mockNavigation: { error: { key: string } | null; dismissError: () => void } = {
  error: null,
  dismissError: () => {
    mockNavigation.error = null
  }
}

jest.mock('@/lib/api', () => ({
  api: { searchMessages: jest.fn() },
  ApiError: jest.requireActual('@/lib/api/errors').ApiError,
  resolveMediaUrl: (value: string) => value
}))
jest.mock('@/hooks/useAppNavigate', () => ({
  useAppNavigate: () => ({
    navigate: mockNavigate,
    orchestratedGoToDm: mockGoToDm,
    orchestratedGoToChannel: mockGoToChannel
  })
}))
jest.mock('@/stores/navigation.store', () => ({ useNavigationStore: { getState: () => mockNavigation } }))
jest.mock('@/components/UserAvatar', () => ({ UserAvatar: () => null }))
jest.mock('simplebar-react', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
jest.mock('@/components/media/MessageMediaGallery', () => ({
  MessageMediaProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useMessageMedia: () => ({ openByKey: jest.fn() })
}))
jest.mock('@/components/ui', () => ({
  IconButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button aria-label={label} onClick={onClick} />
  ),
  Spinner: () => <div role="status">Loading</div>
}))
const search = jest.mocked(api.searchMessages)
let mockIsMobile = false
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => mockIsMobile }))
function Harness({ initial = '' }: { initial?: string }) {
  const [query, setQuery] = useState(initial)
  return (
    <SearchDrawer
      query={query}
      onQueryChange={setQuery}
      onClose={jest.fn()}
      defaultScope="conversation"
      conversationId="conv"
    />
  )
}
beforeEach(() => {
  mockNavigate.mockReset()
  mockGoToChannel.mockReset().mockResolvedValue(undefined)
  mockGoToDm.mockReset().mockResolvedValue(undefined)
  mockNavigation.error = null
  mockIsMobile = false
  search.mockReset().mockResolvedValue({ results: [], total: 0 })
  useServerStore.setState({ currentServerId: null })
  useChannelStore.setState({ currentChannelId: null, channels: [] })
})
afterEach(() => {
  jest.useRealTimers()
})

it('applies and toggles a filter immediately with the current conversation scope', async () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'filterVideo' }))
  await waitFor(() => expect(search).toHaveBeenCalledWith('has:video', { offset: 0, conversationId: 'conv' }))
  fireEvent.click(screen.getByRole('button', { name: 'filterVideo' }))
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(screen.queryByRole('button', { name: 'filterTag' })).not.toBeInTheDocument()
})

it('supports date inputs without entering raw filter syntax', async () => {
  render(<Harness />)
  fireEvent.change(screen.getByLabelText('afterDate'), { target: { value: '2026-10-01' } })
  await waitFor(() =>
    expect(search).toHaveBeenCalledWith('after:2026-10-01', expect.objectContaining({ conversationId: 'conv' }))
  )
})

it('collapses mobile filters while keeping active filters removable', async () => {
  mockIsMobile = true
  render(<Harness initial={'hello has:video from:"Jane has:image"'} />)
  expect(screen.queryByRole('button', { name: 'filterVideo' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('afterDate')).not.toBeInTheDocument()
  const chips = screen.getByLabelText('activeFilters')
  expect(chips.querySelectorAll('button')).toHaveLength(3)
  fireEvent.click(chips.querySelector('button')!)
  expect(screen.getByRole('textbox')).toHaveValue('hello  from:"Jane has:image"')
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      'hello  from:"Jane has:image"',
      expect.objectContaining({ conversationId: 'conv' })
    )
  )
  fireEvent.click(screen.getByRole('button', { name: /showFilters/ }))
  expect(screen.getByLabelText('afterDate')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'clearFilters' }))
  expect(screen.getByRole('textbox')).toHaveValue('hello')
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith('hello', expect.objectContaining({ conversationId: 'conv' }))
  )
})

it('does not restore stale results after clearing the query', async () => {
  let finish!: (result: { results: SearchResult[]; total: number }) => void
  search.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  render(<Harness initial="old" />)
  await waitFor(() => expect(search).toHaveBeenCalled())
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  await act(async () => {
    finish({
      results: [
        {
          id: 'stale',
          content: 'stale result',
          authorId: null,
          author: null,
          channelId: null,
          channel: null,
          dmConversationId: 'conv',
          createdAt: '2026-10-17T10:00:00Z'
        }
      ],
      total: 1
    })
  })
  expect(screen.queryByText('stale result')).not.toBeInTheDocument()
  expect(screen.getByText('typeToSearch')).toBeInTheDocument()
})

it('shows actionable invalid-filter errors', async () => {
  search.mockRejectedValueOnce(new ApiError('Use YYYY-MM-DD', 400, {}))
  render(<Harness initial="after:nope" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Use YYYY-MM-DD')
})

it('preserves quoted sender values when toggling filters and editing dates', async () => {
  render(<Harness initial={'from:"Jane has:video before:2026-10-01"'} />)
  const chip = screen.getByRole('button', { name: 'filterVideo' })
  expect(chip).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(chip)
  expect(screen.getByRole('textbox')).toHaveValue('from:"Jane has:video before:2026-10-01" has:video')
  fireEvent.change(screen.getByLabelText('beforeDate'), { target: { value: '2026-11-01' } })
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      'from:"Jane has:video before:2026-10-01" has:video before:2026-11-01',
      expect.objectContaining({ conversationId: 'conv' })
    )
  )
})

it('stops the loading indicator while composing an incomplete sender filter', () => {
  jest.useFakeTimers()
  search.mockImplementationOnce(() => new Promise(() => {}))
  render(<Harness initial="old" />)
  expect(screen.getByRole('status')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'filterSender' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(search).toHaveBeenCalledTimes(1)
})

it('cancels debounced searches when unmounted', () => {
  jest.useFakeTimers()
  const { unmount } = render(<Harness />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft' } })
  unmount()
  act(() => {
    jest.advanceTimersByTime(1000)
  })
  expect(search).not.toHaveBeenCalled()
})

it('ignores a failed old-scope request after switching to everywhere', async () => {
  let fail!: (reason: unknown) => void
  search.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
  )
  render(<Harness initial="hello" />)
  fireEvent.click(screen.getByRole('button', { name: 'scopeEverywhere' }))
  await waitFor(() => expect(search).toHaveBeenLastCalledWith('hello', { offset: 0 }))
  await act(async () => {
    fail(new ApiError('Old failure', 400, {}))
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('retries a failed request with the same conversation scope', async () => {
  search.mockRejectedValueOnce(new Error('offline'))
  render(<Harness initial="hello" />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(search).toHaveBeenLastCalledWith('hello', { offset: 0, conversationId: 'conv' })
})

it.each(['text', 'forum'] as const)(
  'uses the awaited message-link flow for %s replies without timing guesses',
  async (type) => {
    const result: SearchResult = {
      id: 'reply',
      content: 'Thread reply',
      authorId: null,
      author: null,
      channelId: 'channel',
      channel: { id: 'channel', name: 'general', serverId: 'server', type },
      dmConversationId: null,
      threadParentId: 'parent',
      createdAt: '2026-10-17T10:00:00Z'
    }
    search.mockResolvedValue({ results: [result], total: 1 })
    render(<SearchDrawer query="reply" onQueryChange={jest.fn()} onClose={jest.fn()} defaultScope="all" />)
    fireEvent.click(await screen.findByText('Thread reply'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/channels/server/channel?m=reply&thread=parent'))
    expect(mockGoToChannel).toHaveBeenCalledWith('server', 'channel', type === 'forum' ? undefined : 'parent')
  }
)

it('keeps a failed result visible and retries the full navigation intent', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const result: SearchResult = {
    id: 'message',
    content: 'Recoverable result',
    authorId: null,
    author: null,
    channelId: null,
    channel: null,
    dmConversationId: 'conv',
    createdAt: '2026-10-17T10:00:00Z'
  }
  search.mockResolvedValue({ results: [result], total: 1 })
  mockGoToDm.mockImplementationOnce(async () => {
    mockNavigation.error = { key: 'historyLoadFailed' }
  })
  render(<Harness initial="recoverable" />)
  fireEvent.click(await screen.findByText('Recoverable result'))
  expect(await screen.findByRole('alert')).toHaveTextContent('historyLoadFailed')
  expect(mockNavigate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/channels/@me/conv?m=message'))
  expect(mockGoToDm).toHaveBeenCalledTimes(2)
  log.mockRestore()
})
