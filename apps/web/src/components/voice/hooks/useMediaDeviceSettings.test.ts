import { act, renderHook, waitFor } from '@testing-library/react'
import { changeVoiceDevice } from '@/lib/voiceDevices'
import { useMediaDeviceSettings } from './useMediaDeviceSettings'

jest.mock('react-i18next', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})
jest.mock('@/lib/deviceSettings', () => ({
  getSavedAudioInput: () => '',
  getSavedAudioOutput: () => '',
  getSavedCamera: () => ''
}))
jest.mock('@/lib/voiceDevices', () => ({
  changeVoiceDevice: jest.fn().mockResolvedValue(undefined),
  reportVoiceDeviceError: jest.fn()
}))

const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const permissionDescriptor = Object.getOwnPropertyDescriptor(navigator, 'permissions')
let media: {
  enumerateDevices: jest.Mock
  getUserMedia: jest.Mock
  addEventListener: jest.Mock
  removeEventListener: jest.Mock
}
let query: jest.Mock

beforeEach(() => {
  media = {
    enumerateDevices: jest.fn().mockResolvedValue([{ kind: 'audioinput', deviceId: 'mic', label: 'Microphone' }]),
    getUserMedia: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }
  query = jest.fn().mockResolvedValue({ state: 'prompt' })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } })
})

afterEach(() => {
  if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor)
  else Reflect.deleteProperty(navigator, 'mediaDevices')
  if (permissionDescriptor) Object.defineProperty(navigator, 'permissions', permissionDescriptor)
  else Reflect.deleteProperty(navigator, 'permissions')
})

it('updates a disappearing device list and removes the device listener on unmount', async () => {
  const { result, unmount } = renderHook(useMediaDeviceSettings)
  await waitFor(() => expect(result.current.audioInputs).toHaveLength(1))
  const refresh = media.addEventListener.mock.calls[0][1]
  media.enumerateDevices.mockResolvedValue([])
  act(() => refresh())
  await waitFor(() => expect(result.current.audioInputs).toEqual([]))
  unmount()
  expect(media.removeEventListener).toHaveBeenCalledWith('devicechange', refresh)
})

it('releases a permission-label capture that resolves after unmount', async () => {
  query.mockImplementation(({ name }) => Promise.resolve({ state: name === 'microphone' ? 'granted' : 'prompt' }))
  let finish!: (stream: MediaStream) => void
  media.getUserMedia.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const stop = jest.fn()
  const { unmount } = renderHook(useMediaDeviceSettings)
  await waitFor(() => expect(media.getUserMedia).toHaveBeenCalled())
  unmount()
  await act(async () => {
    finish({ getTracks: () => [{ stop }] } as unknown as MediaStream)
  })
  expect(stop).toHaveBeenCalledTimes(1)
})

it('grants explicit access, disposes the temporary stream and commits device selection after success', async () => {
  const stop = jest.fn()
  media.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
  const { result } = renderHook(useMediaDeviceSettings)
  await waitFor(() => expect(result.current.audioInputs).toHaveLength(1))
  await act(async () => {
    await result.current.requestMicAccess()
  })
  expect(result.current.micGranted).toBe(true)
  expect(stop).toHaveBeenCalledTimes(1)
  act(() => result.current.selectInput('new-mic'))
  await waitFor(() => expect(result.current.selectedInput).toBe('new-mic'))
  expect(changeVoiceDevice).toHaveBeenCalledWith('audioinput', 'new-mic')
})

it('handles an unavailable media API without an unhandled rejection', async () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  const { result } = renderHook(useMediaDeviceSettings)
  await act(async () => {
    await result.current.requestMicAccess()
  })
  expect(result.current.micDenied).toBe(true)
  expect(result.current.audioInputs).toEqual([])
})

it('reports denied permissions while retaining available device choices', async () => {
  query.mockResolvedValue({ state: 'denied' })
  media.getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
  const { result } = renderHook(useMediaDeviceSettings)
  await waitFor(() => expect(result.current.micDenied).toBe(true))
  expect(result.current.cameraDenied).toBe(true)
  expect(media.getUserMedia).not.toHaveBeenCalled()
  await act(async () => {
    await result.current.requestMicAccess()
  })
  expect(result.current.micGranted).toBe(false)
  expect(result.current.micDenied).toBe(true)
  expect(result.current.audioInputs).toHaveLength(1)
})

it('enumerates devices even when a previously granted capture fails', async () => {
  query.mockResolvedValue({ state: 'granted' })
  media.getUserMedia.mockRejectedValue(new DOMException('Unavailable', 'NotFoundError'))
  const { result } = renderHook(useMediaDeviceSettings)
  await waitFor(() => expect(result.current.audioInputs).toHaveLength(1))
})
