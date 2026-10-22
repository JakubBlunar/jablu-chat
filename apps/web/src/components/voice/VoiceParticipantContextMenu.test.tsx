import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { VoiceParticipantContextMenu } from './VoiceParticipantContextMenu'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useSettingsStore } from '@/stores/settings.store'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('@/stores/auth.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useAuthStore: create(() => ({ user: { id: 'me' } })) }
})

jest.mock('@/stores/voice-connection.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return {
    useVoiceConnectionStore: create(() => ({
      currentChannelId: null,
      isMuted: false,
      isDeafened: false,
      volumeOverrides: {},
      setVolumeOverride: jest.fn(),
      toggleMute: jest.fn(),
      toggleDeafen: jest.fn()
    }))
  }
})

const setVolume = jest.fn((key: string, value: number) => {
  useVoiceConnectionStore.setState((state) => ({ volumeOverrides: { ...state.volumeOverrides, [key]: value } }))
})
const mute = jest.fn()
const deafen = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  useVoiceConnectionStore.setState({
    currentChannelId: 'voice',
    isMuted: false,
    isDeafened: false,
    volumeOverrides: {},
    setVolumeOverride: setVolume,
    toggleMute: mute,
    toggleDeafen: deafen
  })
  useSettingsStore.getState().setVoiceOutputVolume(100)
})

function open(userId: string, channelId = 'voice') {
  render(
    <VoiceParticipantContextMenu userId={userId} channelId={channelId} name="Member">
      <button>Member</button>
    </VoiceParticipantContextMenu>
  )
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Member' }))
}

it('adjusts only the chosen remote user, stays open for dragging, and restores local mute volume', () => {
  open('other')
  fireEvent.change(screen.getByRole('slider', { name: 'voiceVolume' }), { target: { value: '145' } })
  expect(setVolume).toHaveBeenCalledWith('other', 145)
  expect(screen.getByRole('menu')).toBeInTheDocument()
  expect(screen.getByRole('slider')).toHaveValue('145')
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'muteForMe' }))
  expect(setVolume).toHaveBeenLastCalledWith('other', 0)
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Member' }))
  expect(screen.getByRole('menuitemcheckbox', { name: 'muteForMe' })).toBeChecked()
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'muteForMe' }))
  expect(setVolume).toHaveBeenLastCalledWith('other', 145)
  expect(mute).not.toHaveBeenCalled()
})

it('offers own playback volume, mute and deafen without changing a remote volume', () => {
  open('me')
  fireEvent.change(screen.getByRole('slider', { name: 'outputVolume' }), { target: { value: '65' } })
  expect(useSettingsStore.getState().voiceOutputVolume).toBe(65)
  expect(setVolume).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'mute' }))
  expect(mute).toHaveBeenCalledTimes(1)
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Member' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'deafen' }))
  expect(deafen).toHaveBeenCalledTimes(1)
})

it('disables audio controls for people in another voice channel', () => {
  open('other', 'another-channel')
  expect(screen.getByRole('slider')).toBeDisabled()
  expect(screen.getByRole('menuitemcheckbox', { name: 'muteForMe' })).toBeDisabled()
  act(() => useVoiceConnectionStore.setState({ currentChannelId: 'another-channel' }))
  expect(screen.getByRole('slider')).toBeEnabled()
})
