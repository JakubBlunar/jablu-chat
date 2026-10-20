import { act, renderHook } from '@testing-library/react'
import { memberDisplayName, serverDisplayName, useServerDisplayName } from './serverProfile'
import { useMemberStore, type Member } from '@/stores/member.store'

jest.mock('@/lib/api', () => ({ api: {} }))

const user = { id: 'me', username: 'alice', displayName: 'Global Alice', avatarUrl: null, bio: null }
const member: Member = {
  userId: 'me',
  serverId: 'one',
  displayName: 'Server Alice',
  bio: 'Local bio',
  user,
  roleIds: [],
  joinedAt: ''
}

beforeEach(() =>
  useMemberStore.setState({ members: [member, { ...member, serverId: 'two', displayName: 'Other Alice' }] })
)

it('uses server name, then global name, then username', () => {
  expect(memberDisplayName(member)).toBe('Server Alice')
  expect(memberDisplayName({ ...member, displayName: null })).toBe('Global Alice')
  expect(memberDisplayName({ ...member, displayName: null, user: { ...user, displayName: null } })).toBe('alice')
})

it('scopes identities to the specified server, never to DMs', () => {
  const members = useMemberStore.getState().members
  expect(serverDisplayName(user, 'one', members)).toBe('Server Alice')
  expect(serverDisplayName(user, 'two', members)).toBe('Other Alice')
  expect(serverDisplayName(user, null, members)).toBe('Global Alice')
  expect(serverDisplayName(user, 'unknown', members)).toBe('Global Alice')
})

it('updates open message names immediately after a profile update or reset', () => {
  const { result } = renderHook(() => useServerDisplayName(user, 'one'))
  act(() => useMemberStore.getState().updateServerProfile('one', 'me', { displayName: 'New Alice', bio: null }))
  expect(result.current).toBe('New Alice')
  expect(useMemberStore.getState().members[1].displayName).toBe('Other Alice')
  expect(useMemberStore.getState().members[0].user.displayName).toBe('Global Alice')
  act(() => useMemberStore.getState().updateServerProfile('one', 'me', { displayName: null, bio: null }))
  expect(result.current).toBe('Global Alice')
})
