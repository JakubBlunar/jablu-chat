/**
 * Per-socket session state used to decide whether a user is *actively looking at*
 * the app, as opposed to merely holding a WebSocket.
 *
 * The distinction matters for push delivery: a desktop app minimised to the tray
 * keeps its socket open indefinitely, so gating push on "has a socket" silences
 * every device the user owns. See `isActivelyEngaged`.
 */

export type SessionVisibility = 'visible' | 'hidden'

export type SessionPlatform = 'web' | 'desktop' | 'mobile' | 'bot' | 'unknown'

const PLATFORMS: readonly SessionPlatform[] = ['web', 'desktop', 'mobile', 'bot', 'unknown']

export type PresenceSession = {
  socketId: string
  userId: string
  /** Stable per-install id from the client, used to pair a socket with a push subscription. */
  deviceId: string | null
  platform: SessionPlatform
  /** Whether the app is on screen — window shown and not minimised, or a foreground tab. */
  visibility: SessionVisibility
  /** Whether the app additionally holds OS focus. Never gates push; drives toast style only. */
  focused: boolean
  /** Timestamp of the last user input reported by this session. */
  lastInputAt: number
}

export function normalizePlatform(raw: unknown): SessionPlatform {
  return PLATFORMS.includes(raw as SessionPlatform) ? (raw as SessionPlatform) : 'unknown'
}

export function normalizeVisibility(raw: unknown): SessionVisibility {
  return raw === 'visible' ? 'visible' : 'hidden'
}

export class PresenceRegistry {
  private readonly bySocket = new Map<string, PresenceSession>()
  private readonly byUser = new Map<string, Set<string>>()

  /**
   * Sessions start `hidden` unless the handshake says otherwise, so a client that
   * never reports its state is treated as away and still receives push. Failing
   * open costs a redundant notification; failing closed costs a missed message.
   */
  add(input: {
    socketId: string
    userId: string
    deviceId?: string | null
    platform?: unknown
    visibility?: unknown
    focused?: boolean
    now?: number
  }): PresenceSession {
    const session: PresenceSession = {
      socketId: input.socketId,
      userId: input.userId,
      deviceId: input.deviceId ?? null,
      platform: normalizePlatform(input.platform),
      visibility: normalizeVisibility(input.visibility),
      focused: input.focused === true,
      lastInputAt: input.now ?? Date.now()
    }
    this.bySocket.set(session.socketId, session)
    let sockets = this.byUser.get(session.userId)
    if (!sockets) {
      sockets = new Set()
      this.byUser.set(session.userId, sockets)
    }
    sockets.add(session.socketId)
    return session
  }

  remove(socketId: string): void {
    const session = this.bySocket.get(socketId)
    if (!session) return
    this.bySocket.delete(socketId)
    const sockets = this.byUser.get(session.userId)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) this.byUser.delete(session.userId)
  }

  get(socketId: string): PresenceSession | undefined {
    return this.bySocket.get(socketId)
  }

  sessionsForUser(userId: string): PresenceSession[] {
    const sockets = this.byUser.get(userId)
    if (!sockets) return []
    const out: PresenceSession[] = []
    for (const socketId of sockets) {
      const session = this.bySocket.get(socketId)
      if (session) out.push(session)
    }
    return out
  }

  /** Applies a `presence:state` report. Any report also counts as input. */
  setState(
    socketId: string,
    state: { visibility?: unknown; focused?: boolean },
    now = Date.now()
  ): PresenceSession | undefined {
    const session = this.bySocket.get(socketId)
    if (!session) return undefined
    if (state.visibility !== undefined) session.visibility = normalizeVisibility(state.visibility)
    if (state.focused !== undefined) session.focused = state.focused === true
    session.lastInputAt = now
    return session
  }

  /** Records user input on a session, refreshing its away timer. */
  touch(socketId: string, now = Date.now()): void {
    const session = this.bySocket.get(socketId)
    if (session) session.lastInputAt = now
  }

  /**
   * True when the user has at least one session that is on screen and has seen
   * input recently. Being merely connected is not enough, and holding OS focus is
   * not required — the app open on a second monitor counts.
   */
  isActivelyEngaged(userId: string, awayThresholdMs: number, now = Date.now()): boolean {
    for (const session of this.sessionsForUser(userId)) {
      if (session.visibility !== 'visible') continue
      if (now - session.lastInputAt < awayThresholdMs) return true
    }
    return false
  }

  /** Device ids of every session currently on screen, used to skip redundant push. */
  engagedDeviceIds(userId: string, awayThresholdMs: number, now = Date.now()): Set<string> {
    const ids = new Set<string>()
    for (const session of this.sessionsForUser(userId)) {
      if (session.visibility !== 'visible') continue
      if (now - session.lastInputAt >= awayThresholdMs) continue
      if (session.deviceId) ids.add(session.deviceId)
    }
    return ids
  }

  clear(): void {
    this.bySocket.clear()
    this.byUser.clear()
  }
}
