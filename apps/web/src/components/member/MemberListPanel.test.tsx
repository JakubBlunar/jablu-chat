import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { UserActivity } from '@chat/shared'
import { MemberListPanel } from './MemberListPanel'
import { getRoleColor, type Member } from '@/stores/member.store'
import { useActivityStore } from '@/stores/activity.store'
import { prefetchProfileCard } from '@/stores/profileCard.store'

jest.mock('@/lib/api', () => ({
  api: {},
  resolveMediaUrl: (url: string) => url
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: 'self' } })
}))
jest.mock('@/stores/server.store', () => ({
  useServerStore: (select: (s: { currentServerId: string }) => unknown) => select({ currentServerId: 's1' })
}))
jest.mock('@/stores/profileCard.store', () => ({
  prefetchProfileCard: jest.fn()
}))
jest.mock('@/stores/member.store', () => {
  const actual = jest.requireActual<typeof import('@/stores/member.store')>('@/stores/member.store')
  return { ...actual, getRoleColor: jest.fn(actual.getRoleColor) }
})

function member(id: string): Member {
  return {
    userId: id,
    serverId: 's1',
    roleIds: [],
    joinedAt: '2026-01-01T00:00:00Z',
    user: { id, username: id, displayName: null, avatarUrl: null, bio: null, status: 'online' }
  }
}

beforeEach(() => {
  useActivityStore.setState({ activities: new Map(), hiddenServerIds: [] })
  jest.clearAllMocks()
})

it('renders only the changed row for a status update in a 250-member list', () => {
  const members = Array.from({ length: 250 }, (_, i) => member(`u${i}`))
  const onlineIds = new Set(members.map((m) => m.userId))
  const onMemberClick = jest.fn()
  const { rerender } = render(
    <MemberListPanel members={members} onlineIds={onlineIds} isLoading={false} ownerId="u0" onMemberClick={onMemberClick} />
  )
  expect(getRoleColor).toHaveBeenCalledTimes(250)
  jest.mocked(getRoleColor).mockClear()

  const changed = { ...members[10], user: { ...members[10].user, status: 'dnd' } }
  const updated = members.map((m, i) => i === 10 ? changed : m)
  rerender(
    <MemberListPanel members={updated} onlineIds={onlineIds} isLoading={false} ownerId="u0" onMemberClick={onMemberClick} />
  )
  expect(getRoleColor).toHaveBeenCalledTimes(1)
  expect(getRoleColor).toHaveBeenCalledWith(changed)

  jest.mocked(getRoleColor).mockClear()
  rerender(
    <MemberListPanel members={updated} onlineIds={new Set([...onlineIds, 'another-server-user'])} isLoading={false} ownerId="u0" onMemberClick={onMemberClick} />
  )
  expect(getRoleColor).not.toHaveBeenCalled()
})

it('updates online/offline counts and preserves profile click and hover behavior', () => {
  const members = [member('alice'), member('bob')]
  const onlineIds = new Set(['alice'])
  const onMemberClick = jest.fn()
  const { rerender } = render(
    <MemberListPanel members={members} onlineIds={onlineIds} isLoading={false} ownerId="alice" onMemberClick={onMemberClick} />
  )
  expect(screen.getByText('members.online')).toBeInTheDocument()
  expect(screen.getByText('members.offline')).toBeInTheDocument()
  const alice = screen.getByRole('button', { name: /alice$/ })
  fireEvent.mouseEnter(alice)
  expect(prefetchProfileCard).toHaveBeenCalledWith('alice', undefined)
  fireEvent.click(alice)
  expect(onMemberClick).toHaveBeenCalledWith(members[0], 'online', expect.objectContaining({ width: 0 }))

  rerender(
    <MemberListPanel members={members} onlineIds={new Set(['alice', 'bob'])} isLoading={false} ownerId="alice" onMemberClick={onMemberClick} />
  )
  expect(screen.getByText('members.online')).toBeInTheDocument()
  expect(screen.getByText('members.offline')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /bob$/ }))
  expect(onMemberClick).toHaveBeenLastCalledWith(members[1], 'online', expect.anything())
})

it('keeps activity updates live and rerenders only the affected member', () => {
  const members = [member('alice'), member('bob')]
  render(
    <MemberListPanel members={members} onlineIds={new Set(['alice', 'bob'])} isLoading={false} ownerId={undefined} onMemberClick={jest.fn()} />
  )
  jest.mocked(getRoleColor).mockClear()
  const activity: UserActivity = { kind: 'game', name: 'Test Game', startedAt: '2026-01-01T00:00:00Z' }
  act(() => useActivityStore.getState().setUserActivity('alice', activity))

  expect(screen.getByText('Test Game')).toBeInTheDocument()
  expect(getRoleColor).toHaveBeenCalledTimes(1)
  expect(getRoleColor).toHaveBeenCalledWith(members[0])
})

it('updates only the self row when activity sharing is hidden for this server', () => {
  const activity: UserActivity = { kind: 'game', name: 'Private Game', startedAt: '2026-01-01T00:00:00Z' }
  useActivityStore.setState({ activities: new Map([['self', activity]]) })
  const members = [member('self'), member('other')]
  render(
    <MemberListPanel members={members} onlineIds={new Set(['self', 'other'])} isLoading={false} ownerId={undefined} onMemberClick={jest.fn()} />
  )
  expect(screen.getByText('Private Game')).toBeInTheDocument()
  jest.mocked(getRoleColor).mockClear()
  act(() => useActivityStore.setState({ hiddenServerIds: ['s1'] }))

  expect(screen.queryByText('Private Game')).not.toBeInTheDocument()
  expect(getRoleColor).toHaveBeenCalledTimes(1)
  expect(getRoleColor).toHaveBeenCalledWith(members[0])
})
