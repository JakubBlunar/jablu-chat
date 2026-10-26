import { findMember } from './memberIndex'
import type { Member } from '@/stores/member.store'

const member = (serverId: string, userId: string, displayName = userId): Member => ({
  serverId, userId, displayName, roleIds: [], joinedAt: '',
  user: { id: userId, username: userId, displayName: null, avatarUrl: null, bio: null }
})

it('scopes identities by server and follows replaced member snapshots', () => {
  const a = member('a', 'u', 'A')
  const b = member('b', 'u', 'B')
  const rows = [a, b]
  expect(findMember(rows, 'a', 'u')).toBe(a)
  expect(findMember(rows, 'b', 'u')).toBe(b)
  const updated = member('a', 'u', 'Updated')
  expect(findMember([updated, b], 'a', 'u')).toBe(updated)
  expect(findMember([b], 'a', 'u')).toBeUndefined()
})

it('indexes each snapshot once and does not inspect it for absent users', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => member('s', String(i)))
  const iterate = jest.spyOn(rows, Symbol.iterator)
  expect(findMember(rows, 's', undefined)).toBeUndefined()
  expect(iterate).not.toHaveBeenCalled()
  for (let i = 0; i < 250; i++) expect(findMember(rows, 's', String(i))).toBe(rows[i])
  expect(iterate).toHaveBeenCalledTimes(1)
  expect(findMember(rows, 's', 'missing')).toBeUndefined()
  expect(iterate).toHaveBeenCalledTimes(1)
})
