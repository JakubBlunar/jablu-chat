export type NotifSoundKind = 'message' | 'mention' | 'friend'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

function playTone(freq1: number, freq2: number, volume = 0.25) {
  const ac = getCtx()
  if (!ac) return

  const now = ac.currentTime
  const gain = ac.createGain()
  gain.connect(ac.destination)
  gain.gain.setValueAtTime(volume, now)
  gain.gain.linearRampToValueAtTime(0, now + 0.15)

  const osc1 = ac.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.value = freq1
  osc1.connect(gain)
  osc1.start(now)
  osc1.stop(now + 0.08)

  const osc2 = ac.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.value = freq2
  osc2.connect(gain)
  osc2.start(now + 0.07)
  osc2.stop(now + 0.15)
}

export function playJoinSound() {
  playTone(440, 580)
}

export function playLeaveSound() {
  playTone(580, 440)
}

function playMessageSound() {
  const ac = getCtx()
  if (!ac) return
  const now = ac.currentTime
  const gain = ac.createGain()
  gain.connect(ac.destination)
  gain.gain.setValueAtTime(0.2, now)
  gain.gain.linearRampToValueAtTime(0, now + 0.12)

  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 660
  osc.connect(gain)
  osc.start(now)
  osc.stop(now + 0.12)
}

function playMentionSound() {
  const ac = getCtx()
  if (!ac) return
  const now = ac.currentTime
  const gain = ac.createGain()
  gain.connect(ac.destination)
  gain.gain.setValueAtTime(0.3, now)
  gain.gain.linearRampToValueAtTime(0, now + 0.25)

  const o1 = ac.createOscillator()
  o1.type = 'sine'
  o1.frequency.value = 587
  o1.connect(gain)
  o1.start(now)
  o1.stop(now + 0.1)

  const o2 = ac.createOscillator()
  o2.type = 'sine'
  o2.frequency.value = 784
  o2.connect(gain)
  o2.start(now + 0.1)
  o2.stop(now + 0.25)
}

function playFriendSound() {
  const ac = getCtx()
  if (!ac) return
  const now = ac.currentTime
  const gain = ac.createGain()
  gain.connect(ac.destination)
  gain.gain.setValueAtTime(0.25, now)
  gain.gain.linearRampToValueAtTime(0, now + 0.35)

  const o1 = ac.createOscillator()
  o1.type = 'sine'
  o1.frequency.value = 523
  o1.connect(gain)
  o1.start(now)
  o1.stop(now + 0.1)

  const o2 = ac.createOscillator()
  o2.type = 'sine'
  o2.frequency.value = 659
  o2.connect(gain)
  o2.start(now + 0.1)
  o2.stop(now + 0.2)

  const o3 = ac.createOscillator()
  o3.type = 'sine'
  o3.frequency.value = 784
  o3.connect(gain)
  o3.start(now + 0.2)
  o3.stop(now + 0.35)
}

export function playNotifSound(kind: NotifSoundKind = 'message') {
  switch (kind) {
    case 'mention':
      return playMentionSound()
    case 'friend':
      return playFriendSound()
    default:
      return playMessageSound()
  }
}
