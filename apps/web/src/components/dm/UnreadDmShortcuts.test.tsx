import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { DmConversation } from '@/lib/api'
import { useDmStore } from '@/stores/dm.store'
import { useReadStateStore } from '@/stores/readState.store'
import { UnreadDmShortcuts } from './UnreadDmShortcuts'

const goToDm = jest.fn()
jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ goToDm }) }))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: 'me' } })
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, values: { name: string; count: number }) => `${values.name}: ${values.count}`
  })
}))

const member = {
  userId: 'other',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: '/alice.png',
  bio: null,
  status: 'online',
  createdAt: ''
}
const direct: DmConversation = { id: 'direct', isGroup: false, groupName: null, createdAt: '', members: [member] }
const group: DmConversation = { ...direct, id: 'group', isGroup: true, groupName: 'Weekend' }

beforeEach(() => {
  jest.clearAllMocks()
  useDmStore.setState({ conversations: [direct, group] })
  useReadStateStore.setState({ dms: new Map() })
})

it('renders only unread conversations with the other user avatar and group initial', () => {
  useReadStateStore.getState().incrementDm('direct')
  const { rerender } = render(<UnreadDmShortcuts />)
  expect(screen.getByRole('button', { name: 'Alice: 1' }).querySelector('img')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Weekend/ })).not.toBeInTheDocument()
  act(() => useReadStateStore.getState().incrementDm('group'))
  rerender(<UnreadDmShortcuts />)
  expect(screen.getByRole('button', { name: 'Weekend: 1' })).toHaveTextContent('W')
})

it('navigates directly, closes mobile navigation, and disappears when read', () => {
  useReadStateStore.getState().incrementDm('group')
  const close = jest.fn()
  render(<UnreadDmShortcuts onNavigate={close} />)
  fireEvent.click(screen.getByRole('button', { name: 'Weekend: 1' }))
  expect(goToDm).toHaveBeenCalledWith('group')
  expect(close).toHaveBeenCalled()
  act(() => useReadStateStore.setState({ dms: new Map() }))
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('caps the visible badge without truncating the accessible count', () => {
  useReadStateStore.setState({
    dms: new Map([['direct', { unreadCount: 120, mentionCount: 0, lastReadAt: '', firstUnreadMessageId: null }]])
  })
  render(<UnreadDmShortcuts />)
  expect(screen.getByRole('button', { name: 'Alice: 120' })).toBeInTheDocument()
  expect(screen.getByText('99+')).toBeInTheDocument()
})
