import type { Member } from '@/stores/member.store'
import { resolveReactorIdentity } from './reactorIdentity'

const self = { id: 'self', username: 'alice', displayName: 'Global Alice', avatarUrl: null }
const member: Member = {
  userId: 'self',
  serverId: 'server',
  displayName: 'Server Alice',
  roleIds: [],
  joinedAt: '',
  user: { ...self, bio: null }
}
const base = { self, members: [member], dmMembers: undefined, mode: 'channel' as const, unknownLabel: 'Unknown' }

it('uses a server nickname for channel self and the global identity in DMs', () => {
  expect(resolveReactorIdentity('self', base).displayName).toBe('Server Alice')
  expect(resolveReactorIdentity('self', { ...base, mode: 'dm' }).displayName).toBe('Global Alice')
})

it('resolves channel and DM participants with the same fallback policy', () => {
  const other = {
    ...member,
    userId: 'other',
    displayName: 'Channel Bob',
    user: { ...member.user, id: 'other', username: 'bob' }
  }
  expect(resolveReactorIdentity('other', { ...base, members: [other] }).displayName).toBe('Channel Bob')
  expect(
    resolveReactorIdentity('other', {
      ...base,
      mode: 'dm',
      dmMembers: [
        {
          userId: 'other',
          username: 'bob',
          displayName: 'DM Bob',
          avatarUrl: null,
          bio: null,
          status: 'online',
          createdAt: ''
        }
      ]
    }).displayName
  ).toBe('DM Bob')
  expect(resolveReactorIdentity('missing-user', base)).toEqual({
    userId: 'missing-user',
    displayName: 'Unknown',
    username: 'missing-',
    avatarUrl: null,
    isUnknown: true
  })
})
