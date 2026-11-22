const groupPositions = [-0.75, 0.75, -0.25, 0.25]
const historyLimit = 128

function readPositions(key: string) {
  const saved = new Map<string, number>()
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(entries)) return saved
    for (const entry of entries.slice(-historyLimit)) {
      if (!Array.isArray(entry)) continue
      const [id, pan] = entry
      if (typeof id === 'string' && typeof pan === 'number' && Number.isFinite(pan) && Math.abs(pan) <= 0.75) {
        saved.set(id, pan)
      }
    }
  } catch {
    // Calls still work when browser storage is unavailable.
  }
  return saved
}

function nextPosition(occupied: Set<number>) {
  const free = groupPositions.find((position) => !occupied.has(position))
  if (free !== undefined) return free

  const sorted = [...occupied].sort((a, b) => a - b)
  let widestGap = 0
  let midpoint = 0
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1]
    if (gap > widestGap) {
      widestGap = gap
      midpoint = sorted[i - 1] + gap / 2
    }
  }
  return midpoint
}

/** Keep live positions fixed, and remember each listener's usual seats on this device. */
export class VoiceStereoPositions {
  private remembered = new Map<string, number>()
  private active = new Map<string, number>()
  private hasGroup = false
  private storageKey: string

  constructor(listenerId: string) {
    this.storageKey = `jablu-voice-positions:${listenerId}`
  }

  update(identities: Iterable<string>) {
    const present = new Set(identities)
    if (present.size > 1) this.hasGroup = true
    if (!this.hasGroup) return
    for (const id of this.active.keys()) {
      if (!present.has(id)) this.active.delete(id)
    }

    const arrivals = [...present].filter((id) => !this.active.has(id))
    if (!arrivals.length) return
    const saved = readPositions(this.storageKey)
    const occupied = new Set(this.active.values())
    for (const id of arrivals) {
      const previous = this.remembered.get(id) ?? saved.get(id)
      if (previous !== undefined && !occupied.has(previous)) {
        this.active.set(id, previous)
        occupied.add(previous)
      }
    }
    // Reserve familiar voices' spots even when a guest joins ahead of them.
    const reserved = new Set([...occupied, ...saved.values()])
    for (const id of arrivals) {
      let position = this.active.get(id)
      if (position === undefined) {
        position = nextPosition(reserved)
        this.active.set(id, position)
        reserved.add(position)
      }
      this.remembered.set(id, position)
      const usual = saved.get(id) ?? position
      saved.delete(id)
      saved.set(id, usual)
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify([...saved].slice(-historyLimit)))
    } catch {
      // Keep using the in-call assignments if the device cannot save them.
    }
  }

  get(id: string) {
    return this.active.get(id)
  }
}
