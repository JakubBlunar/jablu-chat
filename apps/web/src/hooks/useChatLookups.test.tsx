import { act, renderHook } from '@testing-library/react'
import type { Role } from '@chat/shared'
import { createChatLookupSelector, useChatLookups } from './useChatLookups'
import { usePermissions } from './usePermissions'
import { processMentions } from '@/lib/markdownMentions'
import { useMemberStore, type Member } from '@/stores/member.store'

jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/stores/auth.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useAuthStore: create(() => ({ user: { id: 'u1' } })) }
})

const role: Role = {
  id: 'r1',
  serverId: 's1',
  name: 'Helpers',
  color: '#ff0000',
  position: 1,
  permissions: '0',
  isDefault: false,
  selfAssignable: false,
  isAdmin: false,
  createdAt: ''
}
function member(overrides: Partial<Member> = {}): Member {
  return {
    userId: 'u1',
    serverId: 's1',
    roleIds: ['r1'],
    roles: [role],
    joinedAt: '',
    user: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null },
    ...overrides
  }
}
beforeEach(() => useMemberStore.setState({ members: [member()] }))

it('sends zero renders for presence and unrelated profile fields, even for the current user', () => {
  let renders = 0
  const { result } = renderHook(() => {
    renders++
    return { lookups: useChatLookups('s1'), permissions: usePermissions('s1') }
  })
  const original = result.current
  const before = renders
  act(() =>
    useMemberStore.getState().updateUserProfile('u1', { status: 'idle', avatarUrl: 'new-avatar', bio: 'new bio' })
  )
  expect(renders).toBe(before)
  expect(result.current.lookups).toBe(original.lookups)
  expect(result.current.permissions).toBe(original.permissions)
})

it('reactively updates rendered mention data after display-name and username edits', () => {
  const { result } = renderHook(() => {
    const lookups = useChatLookups('s1')
    return processMentions('Hi @alice and @renamed', lookups.membersByUsername)
  })
  expect(result.current).toBe('Hi [@Alice](mention:alice) and @renamed')
  act(() => useMemberStore.getState().updateUserProfile('u1', { displayName: 'New name' }))
  expect(result.current).toBe('Hi [@New name](mention:alice) and @renamed')
  act(() => useMemberStore.getState().updateUserProfile('u1', { username: 'renamed' }))
  expect(result.current).toBe('Hi @alice and [@New name](mention:renamed)')
})

it('updates role names/colors and removes departed members without retaining stale indexes', () => {
  const select = createChatLookupSelector('s1')
  const first = select({ members: [member()] })
  const next = select({ members: [member({ roles: [{ ...role, name: 'Moderators', color: '#00ff00' }] })] })
  expect(next.membersByUsername).toBe(first.membersByUsername)
  expect(next.rolesByLowerName.has('helpers')).toBe(false)
  expect(next.rolesByLowerName.get('moderators')?.color).toBe('#00ff00')
  expect(next.authorColors.get('u1')).toBe('#00ff00')
  const empty = select({ members: [] })
  expect(empty.membersByUsername.size).toBe(0)
  expect(empty.rolesByLowerName.size).toBe(0)
  expect(empty.authorColors.size).toBe(0)
})

it('never uses another server membership for colors or mentions', () => {
  const select = createChatLookupSelector('s2')
  const lookups = select({ members: [member()] })
  expect(lookups.membersByUsername.size).toBe(0)
  expect(lookups.rolesByLowerName.size).toBe(0)
  expect(lookups.authorColors.size).toBe(0)
})

it('renders server names in mentions while leaving DM names global', () => {
  useMemberStore.setState({ members: [member({ displayName: 'Server Alice' })] })
  const local = createChatLookupSelector('s1')(useMemberStore.getState())
  const global = createChatLookupSelector(null)(useMemberStore.getState())
  expect(processMentions('@alice', local.membersByUsername)).toBe('[@Server Alice](mention:alice)')
  expect(processMentions('@alice', global.membersByUsername)).toBe('[@Alice](mention:alice)')
  expect(processMentions('@"Alice"', local.membersByUsername)).toBe('[@Server Alice](mention:alice)')
})

it('renders brackets in server names as literal mention text', () => {
  const local = createChatLookupSelector('s1')({ members: [member({ displayName: 'Alice [team]' })] })
  expect(processMentions('@alice', local.membersByUsername)).toBe('[@Alice \\[team\\]](mention:alice)')
})
