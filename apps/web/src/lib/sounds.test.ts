type Automation = { value: number; time: number }

function audioParam() {
  return {
    value: 0,
    setValueAtTime: jest.fn<void, [number, number]>(),
    linearRampToValueAtTime: jest.fn<void, [number, number]>(),
    exponentialRampToValueAtTime: jest.fn<void, [number, number]>()
  }
}

function audioNode() {
  return { connect: jest.fn(), disconnect: jest.fn() }
}

function gainNode() {
  return { ...audioNode(), gain: audioParam() }
}

function oscillatorNode() {
  return {
    ...audioNode(),
    frequency: audioParam(),
    type: 'sine',
    start: jest.fn<void, [number]>(),
    stop: jest.fn<void, [number]>(),
    onended: null as (() => void) | null
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running'
  currentTime = 10
  destination = audioNode()
  gains: ReturnType<typeof gainNode>[] = []
  oscillators: ReturnType<typeof oscillatorNode>[] = []
  resume = jest.fn(async () => {
    this.state = 'running'
  })
  createDynamicsCompressor = jest.fn(() => ({
    ...audioNode(),
    threshold: audioParam(),
    knee: audioParam(),
    ratio: audioParam(),
    attack: audioParam(),
    release: audioParam()
  }))

  createGain() {
    const gain = gainNode()
    this.gains.push(gain)
    return gain
  }

  createOscillator() {
    const oscillator = oscillatorNode()
    this.oscillators.push(oscillator)
    return oscillator
  }
}

let ac: FakeAudioContext
let sounds: typeof import('./sounds')
let constructor: jest.Mock
const originalAudioContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')

beforeEach(() => {
  ac = new FakeAudioContext()
  constructor = jest.fn(() => ac)
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: constructor })
  jest.isolateModules(() => {
    sounds = require('./sounds')
  })
})

afterEach(() => {
  if (originalAudioContext) {
    Object.defineProperty(globalThis, 'AudioContext', originalAudioContext)
  } else {
    Reflect.deleteProperty(globalThis, 'AudioContext')
  }
})

it.each(['join', 'leave', 'message', 'mention', 'friend'] as const)(
  '%s gives every partial its own attack and silent release before stopping',
  (kind) => {
    if (kind === 'join') sounds.playJoinSound()
    else if (kind === 'leave') sounds.playLeaveSound()
    else sounds.playNotifSound(kind)

    expect(ac.oscillators.length).toBeGreaterThan(0)
    for (const [index, oscillator] of ac.oscillators.entries()) {
      const envelope = ac.gains[index]
      const start = oscillator.start.mock.calls[0][0]
      const stop = oscillator.stop.mock.calls[0][0]
      expect(envelope.gain.setValueAtTime).toHaveBeenCalledWith(0, start)
      const ramps: Automation[] = envelope.gain.linearRampToValueAtTime.mock.calls.map(([value, time]) => ({
        value,
        time
      }))
      expect(ramps[0].value).toBeGreaterThan(0)
      expect(ramps[0].time).toBeGreaterThan(start)
      expect(ramps.at(-1)?.value).toBe(0)
      expect(ramps.at(-1)?.time).toBeLessThan(stop)
      expect(envelope.gain.exponentialRampToValueAtTime).toHaveBeenCalled()
      oscillator.onended?.()
      expect(oscillator.disconnect).toHaveBeenCalled()
      expect(envelope.disconnect).toHaveBeenCalled()
    }
    const duration = Math.max(...ac.oscillators.map((o) => o.stop.mock.calls[0][0])) - ac.currentTime
    expect(duration).toBeGreaterThanOrEqual(0.3)
    expect(duration).toBeLessThan(0.7)
  }
)

it('keeps the rising join and falling leave cues distinct', () => {
  sounds.playJoinSound()
  const join = ac.oscillators.map((o) => o.frequency.value)
  ac.oscillators = []
  sounds.playLeaveSound()
  const leave = ac.oscillators.map((o) => o.frequency.value)
  expect(join[0]).toBeLessThan(join[3])
  expect(leave[0]).toBeGreaterThan(leave[3])
})

it('waits for resume and uses the resumed clock before scheduling any audio', async () => {
  ac.state = 'suspended'
  let finishResume!: () => void
  ac.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishResume = resolve
      })
  )
  sounds.playJoinSound()
  expect(ac.resume).toHaveBeenCalled()
  expect(ac.oscillators).toHaveLength(0)

  ac.currentTime = 20
  ac.state = 'running'
  finishResume()
  await Promise.resolve()
  expect(ac.oscillators[0].start.mock.calls[0][0]).toBeGreaterThan(20)
})

it('tolerates autoplay rejection without scheduling audio', async () => {
  ac.state = 'suspended'
  ac.resume.mockRejectedValue(new Error('Autoplay blocked'))
  expect(() => sounds.playNotifSound()).not.toThrow()
  await Promise.resolve()
  expect(ac.oscillators).toHaveLength(0)
})

it('reuses a running context and recreates it after closure', () => {
  sounds.playNotifSound()
  sounds.playJoinSound()
  expect(constructor).toHaveBeenCalledTimes(1)
  expect(ac.createDynamicsCompressor).toHaveBeenCalledTimes(1)
  ac.state = 'closed'
  ac = new FakeAudioContext()
  sounds.playLeaveSound()
  expect(constructor).toHaveBeenCalledTimes(2)
  expect(ac.oscillators.length).toBeGreaterThan(0)
})

it('does not interrupt callers when Web Audio is unavailable', () => {
  constructor.mockImplementation(() => {
    throw new Error('Web Audio unavailable')
  })
  expect(() => sounds.playNotifSound()).not.toThrow()
  expect(() => sounds.playJoinSound()).not.toThrow()
  expect(() => sounds.playLeaveSound()).not.toThrow()
})
