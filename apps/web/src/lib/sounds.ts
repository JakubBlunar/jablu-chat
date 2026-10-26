export type NotifSoundKind = 'message' | 'mention' | 'friend'

type SoundKind = NotifSoundKind | 'join' | 'leave'
type Note = { frequency: number; offset: number; duration: number; volume: number }

// Related, soft chimes: rising for arrival, falling for departure, and a
// quieter single note for messages. Durations include the full release tail.
const scores: Record<SoundKind, readonly Note[]> = {
  join: [
    { frequency: 440, offset: 0, duration: 0.28, volume: 0.18 },
    { frequency: 587.33, offset: 0.12, duration: 0.32, volume: 0.16 }
  ],
  leave: [
    { frequency: 587.33, offset: 0, duration: 0.28, volume: 0.16 },
    { frequency: 440, offset: 0.12, duration: 0.32, volume: 0.14 }
  ],
  message: [{ frequency: 659.25, offset: 0, duration: 0.3, volume: 0.16 }],
  mention: [
    { frequency: 587.33, offset: 0, duration: 0.3, volume: 0.18 },
    { frequency: 783.99, offset: 0.14, duration: 0.34, volume: 0.16 }
  ],
  friend: [
    { frequency: 523.25, offset: 0, duration: 0.3, volume: 0.17 },
    { frequency: 659.25, offset: 0.13, duration: 0.3, volume: 0.15 },
    { frequency: 783.99, offset: 0.26, duration: 0.36, volume: 0.14 }
  ]
}

let ctx: AudioContext | null = null
let output: DynamicsCompressorNode | null = null

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    const ac = new AudioContext({ latencyHint: 'interactive' })
    // Leave headroom when several notifications or participant events coincide.
    const compressor = ac.createDynamicsCompressor()
    compressor.threshold.value = -6
    compressor.knee.value = 6
    compressor.ratio.value = 12
    compressor.attack.value = 0.003
    compressor.release.value = 0.15
    compressor.connect(ac.destination)
    ctx = ac
    output = compressor
  }
  return ctx
}

function scheduleNote(ac: AudioContext, destination: AudioNode, note: Note, start: number) {
  const end = start + note.duration
  // A dominant fundamental with quiet overtones gives a warm, rounded timbre.
  const partials = [1, 0.12, 0.025]
  for (const [index, strength] of partials.entries()) {
    const oscillator = ac.createOscillator()
    const envelope = ac.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = note.frequency * (index + 1)

    // Each partial starts AND finishes at zero. In particular, starting a later
    // note must never reuse an envelope that is already partway through decay.
    const peak = note.volume * strength
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + 0.012)
    envelope.gain.exponentialRampToValueAtTime(peak * 0.001, end - 0.02)
    envelope.gain.linearRampToValueAtTime(0, end)
    oscillator.connect(envelope)
    envelope.connect(destination)
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(end + 0.005)
  }
}

async function play(kind: SoundKind): Promise<void> {
  try {
    const ac = getCtx()
    // Schedule only after resume completes so a suspended context cannot eat
    // the beginning of the cue. Autoplay rejection should stay non-fatal.
    if (ac.state !== 'running') await ac.resume()
    if (ac.state !== 'running' || !output) return
    const start = ac.currentTime + 0.015
    for (const note of scores[kind]) {
      scheduleNote(ac, output, note, start + note.offset)
    }
  } catch {
    // Sound is optional; unsupported audio or autoplay restrictions must not
    // interrupt notifications or joining/leaving voice.
  }
}

export function playJoinSound() {
  void play('join')
}

export function playLeaveSound() {
  void play('leave')
}

export function playNotifSound(kind: NotifSoundKind = 'message') {
  void play(kind)
}
