/** Score speech-band peaks against the surrounding spectrum and the recent
 * background at that frequency. Float dB bins retain quiet microphone detail. */
export class SpeechBandDetector {
  private edges: number[]
  private background = new Float32Array(4).fill(-110)
  private bandLevels = new Float32Array(4)
  private lastTime: number | undefined
  private candidateSince: number | undefined

  constructor(binCount: number, sampleRate: number) {
    const hzPerBin = sampleRate / (2 * binCount)
    this.edges = [100, 450, 1200, 2400, 4500].map((hz) => Math.min(binCount, Math.ceil(hz / hzPerBin)))
  }

  level(spectrum: Float32Array, now: number) {
    const dt = Math.min(250, Math.max(0, now - (this.lastTime ?? now)))
    this.lastTime = now
    let peakedBands = 0
    let score = 0
    let peak = -110
    let totalPower = 0
    let totalDb = 0
    for (let band = 0; band < this.background.length; band++) {
      const count = this.edges[band + 1] - this.edges[band]
      if (!count) continue
      let bandPower = 0
      let bandPeak = -110
      for (let i = this.edges[band]; i < this.edges[band + 1]; i++) {
        const db = Math.max(-110, spectrum[i])
        bandPeak = Math.max(bandPeak, db)
        bandPower += 10 ** (db / 10)
        totalDb += db
      }
      // Track energy across each band. Individual noise bins fluctuate even
      // in a steady fan, while their combined energy stays fairly constant.
      const bandDb = 10 * Math.log10(bandPower / count)
      this.bandLevels[band] = bandDb
      if (bandPeak - bandDb > 7 && bandPeak > -93) peakedBands++
      const floor = this.background[band]
      score = Math.max(score, Math.min(bandPeak + 98, bandDb - floor - 4))
      peak = Math.max(peak, bandPeak)
      totalPower += bandPower
    }
    // A held vowel can have stable energy but peaks in several bands. Give
    // it more time than a single motor tone before treating it as background.
    const rise = 1 - Math.exp(-dt / (peakedBands >= 2 ? 3200 : 550))
    const fall = 1 - Math.exp(-dt / 100)
    for (let i = 0; i < this.background.length; i++) {
      const delta = this.bandLevels[i] - this.background[i]
      this.background[i] += delta * (delta < 0 ? fall : rise)
    }
    const binCount = this.edges[4] - this.edges[0]
    const meanDb = 10 * Math.log10(totalPower / binCount)
    // Inverse spectral flatness in dB. Even a soft consonant can be shaped
    // across several bands without any one harmonic dominating the frame.
    const shaped = meanDb - totalDb / binCount >= 6
    // Broadband noise occasionally has a prominent FFT bin for a single
    // frame. Let clear harmonics through immediately and confirm weaker ones.
    const contrast = peak - meanDb
    if ((!shaped && contrast < 8) || score < 2) {
      this.candidateSince = undefined
      return 0
    }
    if (this.candidateSince === undefined || dt > 100) this.candidateSince = now
    return shaped || contrast >= 13 || now - this.candidateSince >= 24 ? score : 0
  }
}

/** Time-based, continuously adapting gate for the selected level measurement.
 * Noise may rise only while the gate is closed. Speech cannot train itself
 * into the noise floor, including speech that starts immediately on joining. */
export class VoiceActivityDetector {
  private speaking = false
  private noiseFloor = 2
  private lastTime: number | null = null
  private lastVoiceAt = -Infinity

  update(level: number, now: number, mode: 'auto' | 'manual', manualThreshold: number): boolean {
    if (!Number.isFinite(level) || !Number.isFinite(now)) return this.speaking
    const elapsed = this.lastTime === null ? 20 : Math.max(0, Math.min(now - this.lastTime, 250))
    this.lastTime = now
    const opening = mode === 'auto' ? Math.max(4, Math.min(24, this.noiseFloor * 1.4 + 2)) : manualThreshold
    // Hysteresis keeps quieter syllables audible once speech has started.
    const threshold = this.speaking ? opening * 0.55 : opening
    if (level >= threshold) {
      this.speaking = true
      this.lastVoiceAt = now
    } else if (now - this.lastVoiceAt >= (mode === 'auto' ? 900 : 650)) {
      this.speaking = false
    }
    if (mode === 'auto' && (!this.speaking || level < this.noiseFloor)) {
      // Follow a quieter room promptly; adapt upwards slowly during real idle
      // time, never by averaging speech captured during an initial countdown.
      const tau = level < this.noiseFloor ? 600 : 5000
      this.noiseFloor += (Math.max(0, level) - this.noiseFloor) * (1 - Math.exp(-elapsed / tau))
    }
    return this.speaking
  }
}
