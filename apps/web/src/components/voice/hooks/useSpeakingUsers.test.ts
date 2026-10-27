import { act, renderHook } from '@testing-library/react'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useSpeakingUsers } from './useSpeakingUsers'

jest.mock('@/lib/socket', () => ({ getSocket: () => null }))

it('updates speakers and detaches the old room when disconnected', () => {
  const room = { on: jest.fn(), off: jest.fn() }
  useVoiceConnectionStore.setState({ room: room as any })
  const { result, unmount } = renderHook(useSpeakingUsers)
  const listener = room.on.mock.calls[0][1]
  act(() => listener([{ identity: 'speaker' }]))
  expect([...result.current]).toEqual(['speaker'])
  act(() => useVoiceConnectionStore.setState({ room: null }))
  expect([...result.current]).toEqual([])
  expect(room.off).toHaveBeenCalledWith('activeSpeakersChanged', listener)
  unmount()
})
