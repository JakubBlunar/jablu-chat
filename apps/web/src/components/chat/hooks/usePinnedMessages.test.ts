import { act, renderHook, waitFor } from '@testing-library/react'
import { usePinnedMessages } from './usePinnedMessages'
import { useLayoutStore } from '@/stores/layout.store'
import { api } from '@/lib/api'

jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/lib/api', () => ({ api: { getPinnedMessages: jest.fn() } }))

it('consumes a pin request exactly once when its destination mounts', async () => {
  jest.mocked(api.getPinnedMessages).mockResolvedValue([])
  const { result, rerender } = renderHook(({ id }) => usePinnedMessages(id), { initialProps: { id: 'first' } })
  act(() => useLayoutStore.setState({ pinsRequestedFor: 'second' }))
  expect(result.current.pinnedOpen).toBe(false)
  expect(api.getPinnedMessages).not.toHaveBeenCalled()
  rerender({ id: 'second' })
  await waitFor(() => expect(result.current.pinnedLoading).toBe(false))
  expect(result.current.pinnedOpen).toBe(true)
  expect(api.getPinnedMessages).toHaveBeenCalledTimes(1)
  expect(api.getPinnedMessages).toHaveBeenCalledWith('second')
  expect(useLayoutStore.getState().pinsRequestedFor).toBeNull()
})
