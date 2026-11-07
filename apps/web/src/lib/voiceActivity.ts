/** Time-based, continuously adapting gate for the analyser's 0–255 level.
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
