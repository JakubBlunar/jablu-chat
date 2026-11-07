import { VoiceActivityDetector } from './voiceActivity'

it('detects the first word without calibrating speech into background noise', () => {
  const detector = new VoiceActivityDetector()
  for (let time = 0; time < 2500; time += 20) expect(detector.update(28, time, 'auto', 18)).toBe(true)
  // Quiet continuation of the same sentence remains open.
  for (let time = 2500; time < 4000; time += 20) expect(detector.update(4, time, 'auto', 18)).toBe(true)
})

it.each([30, 60, 144, 240])('keeps pauses and quiet syllables audible at %i fps', (fps) => {
  const detector = new VoiceActivityDetector()
  const step = 1000 / fps
  for (let time = 0; time < 1500; time += step) detector.update(1.5, time, 'auto', 18)
  expect(detector.update(8, 1500, 'auto', 18)).toBe(true)
  for (let time = 1500 + step; time < 2250; time += step) expect(detector.update(0.5, time, 'auto', 18)).toBe(true)
  expect(detector.update(4, 2250, 'auto', 18)).toBe(true)
  expect(detector.update(0, 3100, 'auto', 18)).toBe(true)
  expect(detector.update(0, 3200, 'auto', 18)).toBe(false)
})

it('continuously follows a quieter microphone and detects speech long after joining', () => {
  const detector = new VoiceActivityDetector()
  for (let time = 0; time < 15_000; time += 20) expect(detector.update(0.2, time, 'auto', 18)).toBe(false)
  expect(detector.update(4.2, 15_000, 'auto', 18)).toBe(true)
})

it('adapts to gradually increasing background noise without learning a sentence as noise', () => {
  const detector = new VoiceActivityDetector()
  for (let time = 0; time < 60_000; time += 20) {
    expect(detector.update(1 + time / 20_000, time, 'auto', 18)).toBe(false)
  }
  for (let time = 60_000; time < 65_000; time += 20) expect(detector.update(16, time, 'auto', 18)).toBe(true)
  expect(detector.update(6, 65_000, 'auto', 18)).toBe(true)
})

it('retains manual sensitivity with hysteresis and a time-based release', () => {
  const detector = new VoiceActivityDetector()
  expect(detector.update(9, 0, 'manual', 18)).toBe(false)
  expect(detector.update(19, 20, 'manual', 18)).toBe(true)
  expect(detector.update(11, 200, 'manual', 18)).toBe(true)
  expect(detector.update(0, 800, 'manual', 18)).toBe(true)
  expect(detector.update(0, 900, 'manual', 18)).toBe(false)
})
