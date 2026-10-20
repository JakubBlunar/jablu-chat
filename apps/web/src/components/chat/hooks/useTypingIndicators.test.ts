jest.mock('@/lib/socket', () => ({ getSocket: jest.fn() }))
jest.mock('@/stores/member.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useMemberStore: create(() => ({ members: [] })) }
})
jest.mock('@/stores/server.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useServerStore: create(() => ({ currentServerId: null })) }
})
jest.mock('@/stores/message.store', () => ({
  useMessageStore: jest.requireActual<typeof import('zustand')>('zustand').create(() => ({ typingUsers: new Map() }))
}))

import { act, renderHook } from '@testing-library/react'
import { useMemberStore, type Member } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'
import { useMessageStore } from '@/stores/message.store'
import { formatTyping, useTypingIndicators } from './useTypingIndicators'

const member: Member = {
  userId: 'alice',
  serverId: 's1',
  displayName: 'Local Alice',
  bio: null,
  user: { id: 'alice', username: 'alice', displayName: 'Global Alice', avatarUrl: null, bio: null },
  roleIds: [],
  joinedAt: ''
}

describe('useTypingIndicators', () => {
  beforeEach(() => {
    useMemberStore.setState({ members: [member] })
    useServerStore.setState({ currentServerId: 's1' })
    useMessageStore.setState({
      typingUsers: new Map([
        ['alice', { username: 'alice', timeout: setTimeout(() => {}, 0) }],
        ['me', { username: 'me', timeout: setTimeout(() => {}, 0) }]
      ])
    })
  })

  it('shows the server name, excludes self and responds to profile changes', () => {
    const { result } = renderHook(() => useTypingIndicators(false, 'channel', 'me'))
    expect(result.current).toEqual(['Local Alice'])
    act(() => useMemberStore.setState({ members: [{ ...member, displayName: null }] }))
    expect(result.current).toEqual(['Global Alice'])
  })

  it('does not apply names from other servers or channel typing to DMs', () => {
    useServerStore.setState({ currentServerId: 's2' })
    const { result } = renderHook(() => useTypingIndicators(false, 'channel', 'me'))
    expect(result.current).toEqual(['alice'])
    const dm = renderHook(() => useTypingIndicators(true, 'dm', 'me'))
    expect(dm.result.current).toEqual([])
  })
})

describe('formatTyping', () => {
  it('returns empty string for no names', () => {
    expect(formatTyping([])).toBe('')
  })

  it('returns singular for one name', () => {
    expect(formatTyping(['Alice'])).toBe('Alice is typing…')
  })

  it('returns "and" for two names', () => {
    expect(formatTyping(['Alice', 'Bob'])).toBe('Alice and Bob are typing…')
  })

  it('returns "Several people" for three or more', () => {
    expect(formatTyping(['Alice', 'Bob', 'Charlie'])).toBe('Several people are typing…')
  })
})
