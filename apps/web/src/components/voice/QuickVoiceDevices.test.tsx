import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeVoiceDevice } from '@/lib/voiceDevices'
import { useSettingsStore } from '@/stores/settings.store'
import { QuickVoiceDevices } from './QuickVoiceDevices'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = jest.requireActual('@/i18n/locales/en/voice.json')
      return messages[key] ?? key
    }
  })
}))

jest.mock('@/lib/voiceDevices', () => ({
  changeVoiceDevice: jest.fn().mockResolvedValue(undefined),
  reportVoiceDeviceError: jest.fn()
}))

const enumerate = jest.fn()
const mediaDevices = new EventTarget()

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: Object.assign(mediaDevices, { enumerateDevices: enumerate })
  })
  enumerate.mockResolvedValue([
    { deviceId: 'mic-1', kind: 'audioinput', label: 'USB microphone' },
    { deviceId: 'camera-1', kind: 'videoinput', label: 'USB camera' }
  ])
  useSettingsStore.setState({ audioInputDeviceId: '', audioOutputDeviceId: '', cameraDeviceId: '' })
})

it('lists devices and wires accessible selectors to live switching', async () => {
  render(<QuickVoiceDevices />)
  await screen.findByRole('option', { name: 'USB microphone' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Microphone' }), { target: { value: 'mic-1' } })
  await waitFor(() => expect(changeVoiceDevice).toHaveBeenCalledWith('audioinput', 'mic-1'))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Camera' })).toBeEnabled())
  fireEvent.change(screen.getByRole('combobox', { name: 'Camera' }), { target: { value: 'camera-1' } })
  await waitFor(() => expect(changeVoiceDevice).toHaveBeenCalledWith('videoinput', 'camera-1'))
})

it('refreshes when a device is unplugged and shows missing saved selections', async () => {
  useSettingsStore.setState({ audioInputDeviceId: 'mic-1' })
  render(<QuickVoiceDevices />)
  await screen.findByRole('option', { name: 'USB microphone' })
  enumerate.mockResolvedValueOnce([])
  act(() => mediaDevices.dispatchEvent(new Event('devicechange')))
  expect(await screen.findByRole('option', { name: 'Device unavailable' })).toBeDisabled()
})

it('shows enumeration failures explicitly', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    enumerate.mockRejectedValueOnce(new Error('permission denied'))
    render(<QuickVoiceDevices />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load or change devices')
  } finally {
    log.mockRestore()
  }
})
