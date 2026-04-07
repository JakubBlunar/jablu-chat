import '@testing-library/jest-dom'
import { renderHook, act } from '@testing-library/react'
import { useReadReceipts } from './useReadReceipts'

jest.mock('@/lib/api', () => ({
  api: {
    getDmReadStates: jest.fn().mockResolvedValue([]),
  },
}))

jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ on: jest.fn(), off: jest.fn() }),
}))

import { api } from '@/lib/api'
const mockGetDmReadStates = api.getDmReadStates as jest.Mock

function makeConv(overrides?: Partial<{ isGroup: boolean }>) {
  return {
    isGroup: false,
    members: [{ userId: 'u2', username: 'bob', displayName: 'Bob' }],
    ...overrides,
  }
}

describe('useReadReceipts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetDmReadStates.mockResolvedValue([])
  })

  it('fetches read states on mount for a DM channel', async () => {
    const conv = makeConv()
    await act(async () => {
      renderHook(() => useReadReceipts(true, 'conv-1', conv, 'u1', []))
    })
    expect(mockGetDmReadStates).toHaveBeenCalledTimes(1)
    expect(mockGetDmReadStates).toHaveBeenCalledWith('conv-1')
  })

  it('re-fetches when contextId changes', async () => {
    const conv = makeConv()
    const { rerender } = renderHook(
      ({ contextId }) => useReadReceipts(true, contextId, conv, 'u1', []),
      { initialProps: { contextId: 'conv-1' } }
    )
    await act(async () => {})
    expect(mockGetDmReadStates).toHaveBeenCalledTimes(1)

    await act(async () => {
      rerender({ contextId: 'conv-2' })
    })
    expect(mockGetDmReadStates).toHaveBeenCalledTimes(2)
    expect(mockGetDmReadStates).toHaveBeenLastCalledWith('conv-2')
  })

  it('does NOT re-fetch when currentConv object reference changes but contextId is same', async () => {
    let conv = makeConv()
    const { rerender } = renderHook(
      ({ currentConv }) => useReadReceipts(true, 'conv-1', currentConv, 'u1', []),
      { initialProps: { currentConv: conv } }
    )
    await act(async () => {})
    expect(mockGetDmReadStates).toHaveBeenCalledTimes(1)

    // New object identity, same data — simulates re-render creating a new object literal
    conv = { ...makeConv() }
    await act(async () => {
      rerender({ currentConv: conv })
    })

    // Must still be 1 — no extra fetch triggered by object reference change
    expect(mockGetDmReadStates).toHaveBeenCalledTimes(1)
  })

  it('does not fetch when not a DM channel', async () => {
    await act(async () => {
      renderHook(() => useReadReceipts(false, 'ch-1', null, 'u1', []))
    })
    expect(mockGetDmReadStates).not.toHaveBeenCalled()
  })
})
