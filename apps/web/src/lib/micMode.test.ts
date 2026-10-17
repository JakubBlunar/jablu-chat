import { startMicMode, stopMicMode, setRoomGetter } from './micMode'
import { desktopAPI } from './desktop'
import type { Room } from 'livekit-client'

jest.mock('livekit-client', () => ({ Track: { Source: { Microphone: 'microphone' } } }))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: {
    getState: () => ({
      micMode: 'activity',
      vadMode: 'manual',
      vadThreshold: 10,
      pttBinding: { type: 'key', key: ' ' }
    })
  }
}))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
jest.mock('./desktop', () => ({
  isDesktop: true,
  desktopAPI: {
    setPttBinding: jest.fn().mockResolvedValue(undefined),
    clearPtt: jest.fn(),
    onPtt: jest.fn(() => jest.fn()),
    onPttError: jest.fn(() => jest.fn())
  }
}))

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const stopTrack = jest.fn()
const disconnectSource = jest.fn()
const closeContext = jest.fn<Promise<void>, []>()
const unmute = jest.fn()
const originals = new Map<string, PropertyDescriptor | undefined>()

beforeAll(() => {
  for (const name of ['AudioContext', 'MediaStream', 'requestAnimationFrame']) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  }
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: jest.fn(() => ({
      close: closeContext,
      createMediaStreamSource: () => ({ connect: jest.fn(), disconnect: disconnectSource }),
      createAnalyser: () => ({ frequencyBinCount: 256 })
    }))
  })
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: jest.fn() })
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: jest.fn(() => 1) })
})

afterAll(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  setRoomGetter(() => null)
})

beforeEach(() => {
  jest.clearAllMocks()
  closeContext.mockResolvedValue(undefined)
  jest.mocked(desktopAPI!.clearPtt).mockResolvedValue(undefined)
  const room = {
    localParticipant: {
      getTrackPublication: () => ({
        track: {
          mute: jest.fn(),
          unmute,
          mediaStreamTrack: { clone: () => ({ stop: stopTrack }) }
        }
      })
    }
  } as unknown as Room
  setRoomGetter(() => room)
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('stops VAD capture synchronously and returns the AudioContext-close completion', async () => {
  const closing = deferred()
  closeContext.mockReturnValueOnce(closing.promise)
  startMicMode('activity')
  const teardown = stopMicMode(true)
  expect(teardown).toBeInstanceOf(Promise)
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(disconnectSource).toHaveBeenCalledTimes(1)
  expect(unmute).not.toHaveBeenCalled()
  expect(stopMicMode(true)).toBe(teardown)
  let finished = false
  void teardown!.then(() => { finished = true })
  await Promise.resolve()
  expect(finished).toBe(false)
  closing.resolve()
  await teardown
  expect(finished).toBe(true)
})

it('awaits native push-to-talk cleanup without re-enabling the microphone', async () => {
  const clearing = deferred()
  jest.mocked(desktopAPI!.clearPtt).mockReturnValueOnce(clearing.promise)
  startMicMode('push-to-talk')
  const teardown = stopMicMode(true)
  expect(desktopAPI!.clearPtt).toHaveBeenCalledTimes(1)
  expect(unmute).not.toHaveBeenCalled()
  let finished = false
  void teardown!.then(() => { finished = true })
  await Promise.resolve()
  expect(finished).toBe(false)
  clearing.resolve()
  await teardown
  expect(finished).toBe(true)
})

it('reports AudioContext-close rejection and preserves it for awaiting disconnect', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const error = new Error('close failed')
  closeContext.mockRejectedValueOnce(error)
  startMicMode('activity')
  const teardown = stopMicMode(true)
  await expect(teardown).rejects.toMatchObject({ errors: [error] })
  expect(log).toHaveBeenCalledWith('Failed to stop microphone mode:', expect.any(AggregateError))
  expect(stopMicMode(true)).toBeUndefined()
})

it('awaits an earlier VAD teardown when the microphone mode changes before disconnect', async () => {
  const closing = deferred()
  closeContext.mockReturnValueOnce(closing.promise)
  startMicMode('activity')
  startMicMode('push-to-talk')
  const teardown = stopMicMode(true)
  let finished = false
  void teardown!.then(() => { finished = true })
  await Promise.resolve()
  expect(finished).toBe(false)
  closing.resolve()
  await teardown
  expect(finished).toBe(true)
})
