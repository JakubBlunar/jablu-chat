import type { Room } from 'livekit-client'
import { useVoiceConnectionStore } from './voice-connection.store'
import { stopMicMode, startMicMode } from '@/lib/micMode'
import { stopRnnoiseMicrophone } from '@/lib/rnnoiseMicrophone'
import { getSocket } from '@/lib/socket'

jest.mock('livekit-client', () => ({ Track: { Source: { Microphone: 'microphone', Camera: 'camera' } } }))
jest.mock('@/lib/electron', () => ({ isElectron: false }))
jest.mock('@/lib/api', () => ({ api: { getVoiceVolumes: jest.fn().mockResolvedValue({}) } }))
jest.mock('@/lib/socket', () => ({ getSocket: jest.fn(() => ({ emit: jest.fn() })) }))
jest.mock('@/lib/micMode', () => ({
  getMicMode: () => 'always',
  startMicMode: jest.fn(),
  stopMicMode: jest.fn(),
  setRoomGetter: jest.fn()
}))
jest.mock('@/lib/rnnoiseMicrophone', () => ({ stopRnnoiseMicrophone: jest.fn() }))
jest.mock('@/lib/voiceLocalMic', () => ({ setLocalMicTransmissionEnabled: jest.fn() }))
jest.mock('@/lib/deviceSettings', () => ({ CAMERA_PRESETS: {}, getSavedCamera: jest.fn() }))

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fakeRoom() {
  const stopTrack = jest.fn()
  const room = {
    disconnect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    removeAllListeners: jest.fn(),
    localParticipant: {
      getTrackPublications: jest.fn(() => [{ track: { mediaStreamTrack: { stop: stopTrack } } }]),
      getTrackPublication: jest.fn()
    }
  }
  return { room: room as unknown as Room, disconnect: room.disconnect, stopTrack, removeAllListeners: room.removeAllListeners }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(stopRnnoiseMicrophone).mockResolvedValue(undefined)
  useVoiceConnectionStore.setState({
    room: null,
    currentServerId: null,
    currentChannelId: null,
    currentDmCallId: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    isConnecting: false,
    isReconnecting: false,
    micMode: 'always',
    _blurHandle: null,
    _originalCameraTrack: null,
    voiceNetworkDropout: null
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('returns a real promise covering RNNoise and room teardown while stopping capture synchronously', async () => {
  const { room, disconnect, stopTrack, removeAllListeners } = fakeRoom()
  const rnnoise = deferred()
  const closed = deferred()
  const disconnectStarted = deferred()
  jest.mocked(stopRnnoiseMicrophone).mockReturnValueOnce(rnnoise.promise)
  disconnect.mockImplementationOnce(() => {
    disconnectStarted.resolve()
    return closed.promise
  })
  const stopBlur = jest.fn()
  const stopOriginal = jest.fn()
  const emit = jest.fn()
  jest.mocked(getSocket).mockReturnValueOnce({ emit } as unknown as ReturnType<typeof getSocket>)
  useVoiceConnectionStore.setState({
    room,
    currentServerId: 'server',
    currentChannelId: 'channel',
    currentDmCallId: 'call',
    isCameraOn: true,
    isScreenSharing: true,
    _blurHandle: { stop: stopBlur } as unknown as NonNullable<ReturnType<typeof useVoiceConnectionStore.getState>['_blurHandle']>,
    _originalCameraTrack: { stop: stopOriginal } as unknown as MediaStreamTrack
  })

  const teardown = useVoiceConnectionStore.getState().disconnect()
  expect(teardown).toBeInstanceOf(Promise)
  expect(stopMicMode).toHaveBeenCalledWith(true)
  expect(stopBlur).toHaveBeenCalledTimes(1)
  expect(stopOriginal).toHaveBeenCalledTimes(1)
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(removeAllListeners).toHaveBeenCalledTimes(1)
  expect(emit).toHaveBeenCalledWith('dm:call:leave', { callId: 'call' })
  expect(useVoiceConnectionStore.getState()).toMatchObject({
    room: null, currentChannelId: null, currentDmCallId: null, isCameraOn: false, isScreenSharing: false
  })
  expect(disconnect).not.toHaveBeenCalled()

  let finished = false
  void teardown.then(() => { finished = true })
  rnnoise.resolve()
  await disconnectStarted.promise
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(finished).toBe(false)
  closed.resolve()
  await teardown
  expect(finished).toBe(true)
})

it('shares in-flight teardown after the room has already been cleared from state', async () => {
  const { room } = fakeRoom()
  const rnnoise = deferred()
  jest.mocked(stopRnnoiseMicrophone).mockReturnValueOnce(rnnoise.promise)
  useVoiceConnectionStore.setState({ room })
  const first = useVoiceConnectionStore.getState().disconnect()
  const second = useVoiceConnectionStore.getState().disconnect()
  expect(second).toBe(first)
  expect(stopRnnoiseMicrophone).toHaveBeenCalledTimes(1)
  rnnoise.resolve()
  await first
})

it('still awaits room disconnect when RNNoise rejects, and exposes both teardown errors', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const { room, disconnect } = fakeRoom()
  const rnnoiseError = new Error('RNNoise failed')
  const roomError = new Error('room failed')
  const closed = deferred()
  const disconnectStarted = deferred()
  jest.mocked(stopRnnoiseMicrophone).mockRejectedValueOnce(rnnoiseError)
  disconnect.mockImplementationOnce(() => {
    disconnectStarted.resolve()
    return closed.promise
  })
  useVoiceConnectionStore.setState({ room })
  const teardown = useVoiceConnectionStore.getState().disconnect()
  const assertion = expect(teardown).rejects.toMatchObject({
    errors: [
      expect.objectContaining({ cause: rnnoiseError }),
      expect.objectContaining({ cause: roomError })
    ]
  })
  await disconnectStarted.promise
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(log).not.toHaveBeenCalled()
  closed.reject(roomError)
  await assertion
  expect(log).toHaveBeenCalledWith('Failed to disconnect voice:', expect.any(AggregateError))
  expect(useVoiceConnectionStore.getState().room).toBeNull()
})

it('waits for microphone-mode teardown as well as RNNoise before closing the room', async () => {
  const { room, disconnect } = fakeRoom()
  const microphone = deferred()
  jest.mocked(stopMicMode).mockReturnValueOnce(microphone.promise)
  useVoiceConnectionStore.setState({ room })
  const teardown = useVoiceConnectionStore.getState().disconnect()
  await Promise.resolve()
  expect(stopRnnoiseMicrophone).toHaveBeenCalledWith(room)
  expect(disconnect).not.toHaveBeenCalled()
  microphone.resolve()
  await teardown
  expect(disconnect).toHaveBeenCalledTimes(1)
})

it('still closes the room and reports microphone-mode failure', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const { room, disconnect } = fakeRoom()
  const error = new Error('audio context failed')
  jest.mocked(stopMicMode).mockReturnValueOnce(Promise.reject(error))
  useVoiceConnectionStore.setState({ room })
  await expect(useVoiceConnectionStore.getState().disconnect()).rejects.toMatchObject({
    errors: [expect.objectContaining({ cause: error })]
  })
  expect(disconnect).toHaveBeenCalledTimes(1)
})

it('handles failures from legacy callers that intentionally do not await disconnect', async () => {
  const reported = deferred()
  const log = jest.spyOn(console, 'error').mockImplementation(() => { reported.resolve() })
  const { room, disconnect } = fakeRoom()
  disconnect.mockRejectedValueOnce(new Error('close failed'))
  useVoiceConnectionStore.setState({ room })
  void useVoiceConnectionStore.getState().disconnect()
  await reported.promise
  expect(log).toHaveBeenCalledWith('Failed to disconnect voice:', expect.any(AggregateError))
})

it('does not reset a newly connected room when an old teardown finishes', async () => {
  const oldRoom = fakeRoom()
  const newRoom = fakeRoom()
  const rnnoise = deferred()
  jest.mocked(stopRnnoiseMicrophone).mockReturnValueOnce(rnnoise.promise)
  useVoiceConnectionStore.setState({ room: oldRoom.room })
  const teardown = useVoiceConnectionStore.getState().disconnect()
  useVoiceConnectionStore.setState({ room: newRoom.room, currentChannelId: 'new-channel' })
  rnnoise.resolve()
  await teardown
  expect(useVoiceConnectionStore.getState()).toMatchObject({ room: newRoom.room, currentChannelId: 'new-channel' })
  expect(newRoom.disconnect).not.toHaveBeenCalled()
})

it('awaits an unexpected-close teardown even when logout subsequently calls disconnect again', async () => {
  const { room } = fakeRoom()
  const rnnoise = deferred()
  jest.mocked(stopRnnoiseMicrophone).mockReturnValueOnce(rnnoise.promise)
  useVoiceConnectionStore.setState({ room, currentChannelId: 'channel' })
  const info = { serverId: 'server', channelId: 'channel', channelName: 'Voice' }
  const unexpected = useVoiceConnectionStore.getState().disconnectAfterUnexpectedClose(info)
  expect(useVoiceConnectionStore.getState()).toMatchObject({ viewingVoiceRoom: true, voiceNetworkDropout: info })
  const logoutTeardown = useVoiceConnectionStore.getState().disconnect()
  expect(logoutTeardown).toBe(unexpected)
  expect(useVoiceConnectionStore.getState().voiceNetworkDropout).toBeNull()
  rnnoise.resolve()
  await logoutTeardown
})

it('cancels pending microphone-mode bootstrap so it cannot restart capture after disconnect', async () => {
  jest.useFakeTimers()
  try {
    const { room } = fakeRoom()
    useVoiceConnectionStore.setState({ micMode: 'activity' })
    useVoiceConnectionStore.getState().setConnected(room)
    expect(jest.getTimerCount()).toBe(1)
    await useVoiceConnectionStore.getState().disconnect()
    await jest.advanceTimersByTimeAsync(2500)
    expect(startMicMode).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  } finally {
    jest.useRealTimers()
  }
})
