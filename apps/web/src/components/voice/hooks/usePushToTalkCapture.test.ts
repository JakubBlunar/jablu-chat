import { act, renderHook } from '@testing-library/react'
import { setPttBinding } from '@/lib/micMode'
import { usePushToTalkCapture } from './usePushToTalkCapture'

jest.mock('@/lib/micMode', () => ({
  getPttBinding: () => ({ type: 'key', key: ' ' }),
  getMicMode: () => 'activity',
  setPttBinding: jest.fn()
}))
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: { getState: () => ({ setMicMode: jest.fn() }) }
}))

it('records one binding and cancels with Escape without replacing the saved binding', () => {
  const { result } = renderHook(usePushToTalkCapture)
  act(() => result.current.handlePttRecord())
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', cancelable: true })))
  expect(result.current.pttBinding).toEqual({ type: 'key', key: 'v' })
  expect(result.current.recordingPtt).toBe(false)
  act(() => result.current.handlePttRecord())
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
  expect(result.current.recordingPtt).toBe(false)
  expect(setPttBinding).toHaveBeenCalledTimes(1)
})

it('removes capture listeners on unmount', () => {
  jest.mocked(setPttBinding).mockClear()
  const { result, unmount } = renderHook(usePushToTalkCapture)
  act(() => result.current.handlePttRecord())
  unmount()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', cancelable: true }))
  expect(setPttBinding).not.toHaveBeenCalled()
})
