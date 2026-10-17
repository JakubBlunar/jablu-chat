import { changeVoiceDevice } from './voiceDevices'
import { useSettingsStore } from '@/stores/settings.store'

const restart = jest.fn().mockResolvedValue(undefined)
const stopMicMode = jest.fn()
const startMicMode = jest.fn()
const state = {
  room: { switchActiveDevice: jest.fn().mockResolvedValue(true) },
  isMuted: false,
  isDeafened: false,
  micMode: 'activity',
  isCameraOn: false,
  isBlurEnabled: false,
  setAudioOutputDeviceId: jest.fn(),
  stopCamera: jest.fn().mockImplementation(async () => {
    state.isCameraOn = false
  }),
  startCamera: jest.fn().mockImplementation(async () => {
    state.isCameraOn = true
  })
}
jest.mock('@/stores/voice-connection.store', () => ({ useVoiceConnectionStore: { getState: () => state } }))
jest.mock('@/lib/voiceMicPipelineRestart', () => ({
  restartMicrophonePipeline: (...args: unknown[]) => restart(...args)
}))
jest.mock('@/lib/micMode', () => ({
  stopMicMode: () => stopMicMode(),
  startMicMode: (...args: unknown[]) => startMicMode(...args)
}))

beforeEach(() => {
  jest.clearAllMocks()
  restart.mockResolvedValue(undefined)
  state.room.switchActiveDevice.mockResolvedValue(true)
  state.isMuted = false
  state.isDeafened = false
  state.isCameraOn = false
  useSettingsStore.setState({
    audioInputDeviceId: 'old',
    audioOutputDeviceId: '',
    cameraDeviceId: '',
    cameraQuality: '720p'
  })
})

it('rebuilds the microphone pipeline, restores VAD and persists the device', async () => {
  await changeVoiceDevice('audioinput', 'mic-2')
  expect(restart).toHaveBeenCalledWith(state.room, 'mic-2', true)
  expect(startMicMode).toHaveBeenCalledWith('activity')
  expect(useSettingsStore.getState().audioInputDeviceId).toBe('mic-2')
})

it.each(['isMuted', 'isDeafened'] as const)('does not enable capture when %s', async (key) => {
  state[key] = true
  await changeVoiceDevice('audioinput', 'mic-2')
  expect(restart).toHaveBeenCalledWith(state.room, 'mic-2', false)
  expect(startMicMode).not.toHaveBeenCalled()
})

it('restores the old microphone on failure without persisting the failed selection', async () => {
  restart.mockRejectedValueOnce(new Error('disconnected device'))
  await expect(changeVoiceDevice('audioinput', 'bad')).rejects.toThrow('disconnected device')
  expect(restart).toHaveBeenLastCalledWith(state.room, 'old', true)
  expect(useSettingsStore.getState().audioInputDeviceId).toBe('old')
})

it('does not open the camera when selecting a device with camera off', async () => {
  await changeVoiceDevice('videoinput', 'camera-2')
  expect(state.startCamera).not.toHaveBeenCalled()
  expect(useSettingsStore.getState().cameraDeviceId).toBe('camera-2')
})

it('recreates a live blurred camera with blur still enabled', async () => {
  state.isCameraOn = true
  state.isBlurEnabled = true
  await changeVoiceDevice('videoinput', 'camera-2')
  expect(state.stopCamera).toHaveBeenCalled()
  expect(state.startCamera).toHaveBeenCalledWith('720p', true)
})

it('only persists audio output after a successful switch', async () => {
  state.room.switchActiveDevice.mockResolvedValueOnce(false)
  await expect(changeVoiceDevice('audiooutput', 'missing')).rejects.toThrow()
  expect(useSettingsStore.getState().audioOutputDeviceId).toBe('')
  await changeVoiceDevice('audiooutput', 'speakers')
  expect(state.setAudioOutputDeviceId).toHaveBeenCalledWith('speakers')
  expect(useSettingsStore.getState().audioOutputDeviceId).toBe('speakers')
})
