import { useMemberStore, getTopRole, getRoleColor } from './member.store'
import type { Member } from './member.store'
import type { Role } from '@chat/shared'

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() }
}))

import { api } from '@/lib/api'
const mockGet = jest.mocked(api.get)

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'r1',
    serverId: 's1',
    name: 'Member',
    color: null,
    position: 0,
    permissions: '0',
    isDefault: false,
    selfAssignable: false,
    isAdmin: false,
    ...overrides
  } as Role
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    userId: 'u1',
    serverId: 's1',
    roleIds: [],
    joinedAt: '2024-01-01T00:00:00Z',
    user: {
      id: 'u1',
      username: 'alice',
      displayName: null,
      avatarUrl: null,
      bio: null
    },
    ...overrides
  }
}

function resetStore() {
  useMemberStore.setState({
    members: [],
    onlineUserIds: new Set(),
    realtimeStatuses: new Map(),
    isLoading: false
  })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('getTopRole', () => {
  it('returns undefined when member has no roles', () => {
    expect(getTopRole(makeMember())).toBeUndefined()
    expect(getTopRole(makeMember({ roles: [] }))).toBeUndefined()
  })

  it('returns the highest-position non-default role', () => {
    const roles = [
      makeRole({ id: 'r1', position: 1, isDefault: false }),
      makeRole({ id: 'r2', position: 3, isDefault: false }),
      makeRole({ id: 'r3', position: 2, isDefault: false })
    ]
    expect(getTopRole(makeMember({ roles }))?.id).toBe('r2')
  })

  it('falls back to first role when all are default', () => {
    const roles = [
      makeRole({ id: 'default', position: 0, isDefault: true })
    ]
    expect(getTopRole(makeMember({ roles }))?.id).toBe('default')
  })

  it('ignores default roles when non-default exist', () => {
    const roles = [
      makeRole({ id: 'default', position: 10, isDefault: true }),
      makeRole({ id: 'mod', position: 5, isDefault: false })
    ]
    expect(getTopRole(makeMember({ roles }))?.id).toBe('mod')
  })
})

describe('getRoleColor', () => {
  it('returns null when member has no roles', () => {
    expect(getRoleColor(makeMember())).toBeNull()
    expect(getRoleColor(makeMember({ roles: [] }))).toBeNull()
  })

  it('returns null when no roles have color', () => {
    const roles = [makeRole({ color: null })]
    expect(getRoleColor(makeMember({ roles }))).toBeNull()
  })

  it('returns the highest-position role color', () => {
    const roles = [
      makeRole({ id: 'r1', color: '#ff0000', position: 1 }),
      makeRole({ id: 'r2', color: '#00ff00', position: 3 }),
      makeRole({ id: 'r3', color: null, position: 5 })
    ]
    expect(getRoleColor(makeMember({ roles }))).toBe('#00ff00')
  })
})

describe('useMemberStore', () => {
  describe('normalizeMember (via addMember)', () => {
    it('handles { role: Role } wire format', () => {
      const raw = {
        userId: 'u1', serverId: 's1', joinedAt: '2024-01-01T00:00:00Z',
        user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, bio: null },
        roles: [{ role: makeRole({ id: 'r1' }) }]
      }

      useMemberStore.getState().addMember(raw as any)
      const member = useMemberStore.getState().members[0]

      expect(member.roleIds).toEqual(['r1'])
      expect(member.roles![0].id).toBe('r1')
    })

    it('handles flat Role[] wire format', () => {
      const raw = {
        userId: 'u1', serverId: 's1', joinedAt: '2024-01-01T00:00:00Z',
        user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, bio: null },
        roles: [makeRole({ id: 'r2' })]
      }

      useMemberStore.getState().addMember(raw as any)
      const member = useMemberStore.getState().members[0]

      expect(member.roleIds).toEqual(['r2'])
    })

    it('falls back to roleIds when roles is undefined', () => {
      const raw = {
        userId: 'u1', serverId: 's1', joinedAt: '2024-01-01T00:00:00Z',
        roleIds: ['r3', 'r4'],
        user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, bio: null }
      }

      useMemberStore.getState().addMember(raw as any)
      const member = useMemberStore.getState().members[0]

      expect(member.roleIds).toEqual(['r3', 'r4'])
      expect(member.roles).toBeUndefined()
    })
  })

  describe('addMember', () => {
    it('prevents duplicate members', () => {
      const member = makeMember()
      useMemberStore.getState().addMember(member)
      useMemberStore.getState().addMember(member)

      expect(useMemberStore.getState().members).toHaveLength(1)
    })
  })

  describe('removeMember', () => {
    it('removes the member by serverId and userId', () => {
      useMemberStore.setState({ members: [makeMember()] })
      useMemberStore.getState().removeMember('s1', 'u1')

      expect(useMemberStore.getState().members).toHaveLength(0)
    })
  })

  describe('resolveStatus', () => {
    it('returns "offline" when user is not in onlineUserIds', () => {
      expect(useMemberStore.getState().resolveStatus('u1')).toBe('offline')
    })

    it('returns "online" when user is online with no explicit status', () => {
      useMemberStore.setState({
        onlineUserIds: new Set(['u1']),
        realtimeStatuses: new Map()
      })
      expect(useMemberStore.getState().resolveStatus('u1')).toBe('online')
    })

    it('returns realtime status when available', () => {
      useMemberStore.setState({
        onlineUserIds: new Set(['u1']),
        realtimeStatuses: new Map([['u1', 'dnd']])
      })
      expect(useMemberStore.getState().resolveStatus('u1')).toBe('dnd')
    })

    it('returns "online" for unknown status strings', () => {
      useMemberStore.setState({
        onlineUserIds: new Set(['u1']),
        realtimeStatuses: new Map([['u1', 'unknown_status']])
      })
      expect(useMemberStore.getState().resolveStatus('u1')).toBe('online')
    })
  })

  describe('fetchMembers', () => {
    it('merges realtime statuses into fetched members', async () => {
      useMemberStore.setState({
        realtimeStatuses: new Map([['u1', 'dnd']])
      })
      mockGet.mockResolvedValue([{
        userId: 'u1', serverId: 's1', joinedAt: '2024-01-01',
        roleIds: [],
        user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, bio: null }
      }])

      await useMemberStore.getState().fetchMembers('s1')

      const member = useMemberStore.getState().members[0]
      expect(member.user.status).toBe('dnd')
      expect(useMemberStore.getState().isLoading).toBe(false)
    })

    it('resets isLoading on error', async () => {
      mockGet.mockRejectedValue(new Error('fail'))

      await expect(useMemberStore.getState().fetchMembers('s1')).rejects.toThrow()
      expect(useMemberStore.getState().isLoading).toBe(false)
    })
  })

  describe('setUserOnline / setUserOffline', () => {
    it('adds and removes user from onlineUserIds', () => {
      useMemberStore.getState().setUserOnline('u1')
      expect(useMemberStore.getState().onlineUserIds.has('u1')).toBe(true)
      expect(useMemberStore.getState().realtimeStatuses.get('u1')).toBe('online')

      useMemberStore.getState().setUserOffline('u1')
      expect(useMemberStore.getState().onlineUserIds.has('u1')).toBe(false)
      expect(useMemberStore.getState().realtimeStatuses.has('u1')).toBe(false)
    })
  })
})
