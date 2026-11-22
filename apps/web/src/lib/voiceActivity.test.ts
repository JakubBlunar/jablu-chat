import { SpeechBandDetector, VoiceActivityDetector } from './voiceActivity'

it.each([32_000, 44_100, 48_000, 96_000])('detects a quiet vowel against broadband noise at %i Hz', (sampleRate) => {
  const fftSize = 2 ** Math.round(Math.log2(sampleRate * 0.022))
  const spectrum = new Float32Array(fftSize / 2).fill(-99)
  const band = new SpeechBandDetector(spectrum.length, sampleRate)
  const gate = new VoiceActivityDetector()
  const tick = (ms: number) => gate.update(band.level(spectrum, ms), ms, 'auto', 18)
  for (let t = 0; t < 2000; t += 20) expect(tick(t)).toBe(false)
  for (const hz of [280, 560, 840, 1400]) spectrum[Math.round((hz * fftSize) / sampleRate)] = -81
  tick(2000)
  tick(2020)
  for (let t = 2040; t < 3600; t += 20) expect(tick(t)).toBe(true)
  spectrum.fill(-99)
  expect(tick(4050)).toBe(true)
  expect(tick(4550)).toBe(false)
})

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
