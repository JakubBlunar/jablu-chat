import { renderHook } from '@testing-library/react'
import { usePermissions } from './usePermissions'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { useMemberStore } from '@/stores/member.store'
import { ALL_PERMISSIONS, Permission } from '@chat/shared'

beforeEach(() => {
  useAuthStore.setState({ user: null } as any)
  useServerStore.setState({ servers: [] } as any)
  useMemberStore.setState({ members: [] } as any)
})

describe('usePermissions', () => {
  it('returns empty permissions when serverId is null', () => {
    useAuthStore.setState({ user: { id: 'u1' } } as any)

    const { result } = renderHook(() => usePermissions(null))

    expect(result.current.permissions).toBe(0n)
    expect(result.current.has(Permission.MANAGE_SERVER)).toBe(false)
    expect(result.current.isOwner).toBe(false)
    expect(result.current.roles).toEqual([])
  })

  it('returns empty permissions when user is not logged in', () => {
    const { result } = renderHook(() => usePermissions('s1'))

    expect(result.current.permissions).toBe(0n)
    expect(result.current.has(Permission.SEND_MESSAGES)).toBe(false)
  })

  it('returns empty permissions when member is not found', () => {
    useAuthStore.setState({ user: { id: 'u1' } } as any)
    useServerStore.setState({ servers: [{ id: 's1', ownerId: 'other' }] } as any)

    const { result } = renderHook(() => usePermissions('s1'))

    expect(result.current.permissions).toBe(0n)
  })

  it('grants ALL_PERMISSIONS to server owner', () => {
    useAuthStore.setState({ user: { id: 'u1' } } as any)
    useServerStore.setState({ servers: [{ id: 's1', ownerId: 'u1' }] } as any)
    useMemberStore.setState({
      members: [{
        userId: 'u1', serverId: 's1', roleIds: [], joinedAt: '',
        roles: [],
        user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, bio: null }
      }]
    } as any)

    const { result } = renderHook(() => usePermissions('s1'))

    expect(result.current.permissions).toBe(ALL_PERMISSIONS)
    expect(result.current.isOwner).toBe(true)
    expect(result.current.has(Permission.MANAGE_SERVER)).toBe(true)
    expect(result.current.has(Permission.BAN_MEMBERS)).toBe(true)
  })

  it('computes permission bitfield from member roles', () => {
    useAuthStore.setState({ user: { id: 'u1' } } as any)
    useServerStore.setState({ servers: [{ id: 's1', ownerId: 'other' }] } as any)

    const SEND = Permission.SEND_MESSAGES
    const MANAGE = Permission.MANAGE_MESSAGES

    useMemberStore.setState({
      members: [{
        userId: 'u1', serverId: 's1', roleIds: ['r1', 'r2'], joinedAt: '',
        roles: [
          { id: 'r1', serverId: 's1', name: 'Role1', permissions: SEND.toString(), position: 1, color: null, isDefault: false, selfAssignable: false, isAdmin: false },
          { id: 'r2', serverId: 's1', name: 'Role2', permissions: MANAGE.toString(), position: 2, color: null, isDefault: false, selfAssignable: false, isAdmin: false },
        ],
        user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, bio: null }
      }]
    } as any)

    const { result } = renderHook(() => usePermissions('s1'))

    expect(result.current.has(SEND)).toBe(true)
    expect(result.current.has(MANAGE)).toBe(true)
    expect(result.current.has(Permission.MANAGE_SERVER)).toBe(false)
    expect(result.current.isOwner).toBe(false)
  })

  it('returns empty roles for members without roles array', () => {
    useAuthStore.setState({ user: { id: 'u1' } } as any)
    useServerStore.setState({ servers: [{ id: 's1', ownerId: 'other' }] } as any)
    useMemberStore.setState({
      members: [{
        userId: 'u1', serverId: 's1', roleIds: [], joinedAt: '',
        user: { id: 'u1', username: 'alice', displayName: null, avatarUrl: null, bio: null }
      }]
    } as any)

    const { result } = renderHook(() => usePermissions('s1'))

    expect(result.current.roles).toEqual([])
    expect(result.current.permissions).toBe(0n)
  })
})
