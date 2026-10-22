import type { UserActivity } from '@chat/shared'

export type ActivityReport = UserActivity & { appId?: string | null; executable?: string | null; sequence?: number }
export type ActivityPolicy = {
  shareEnabled: boolean
  shareGames: boolean
  shareMusic: boolean
  hiddenGames: { name: string; steamAppId: string | null; executable: string | null }[]
  recipientIds: Set<string>
}
type Entry = { report: ActivityReport; owner: string; expiresAt: number; checkedAt: number }

/** Rich activity is a renewable observation, independent of input/online presence. */
export class RichActivityTracker {
  static readonly LEASE_MS = 90_000
  private readonly entries = new Map<string, Entry>()
  private readonly audiences = new Map<string, Set<string>>()
  private readonly pending = new Map<string, Promise<void>>()
  private readonly latest = new Map<string, object>()
  private readonly reporters = new Map<string, string>()
  private readonly sequences = new Map<string, number>()
  private readonly dirty = new Set<string>()
  private revision = 0

  constructor(
    private readonly readPolicy: (userId: string) => Promise<ActivityPolicy>,
    private readonly emit: (
      recipientId: string,
      payload: { userId: string; activity: UserActivity | null; revision: number }
    ) => void
  ) {}

  private accept(socketId: string, sequence?: number) {
    if (sequence === undefined) return true // Older desktop clients.
    if (sequence <= (this.sequences.get(socketId) ?? -1)) return false
    this.sequences.set(socketId, sequence)
    return true
  }

  private async policy(userId: string) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.readPolicy(userId),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Activity privacy lookup timed out')), 5000)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private run(userId: string, action: (current: () => boolean) => Promise<void>) {
    const token = {}
    this.latest.set(userId, token)
    const current = () => this.latest.get(userId) === token
    const task = (this.pending.get(userId) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (current()) await action(current)
      })
    this.pending.set(userId, task)
    void task
      .finally(() => {
        if (this.pending.get(userId) === task) {
          this.pending.delete(userId)
          this.latest.delete(userId)
          if (!this.entries.has(userId)) this.reporters.delete(userId)
        }
      })
      .catch(() => {})
    return task
  }

  private permitted(report: ActivityReport, policy: ActivityPolicy) {
    if (!policy.shareEnabled || !(report.kind === 'game' ? policy.shareGames : policy.shareMusic)) return false
    return (
      report.kind !== 'game' ||
      !policy.hiddenGames.some(
        (game) =>
          game.name.toLowerCase() === report.name.toLowerCase() ||
          (!!report.appId && game.steamAppId === report.appId) ||
          (!!report.executable &&
            game.executable?.split(',').some((exe) => exe.trim().toLowerCase() === report.executable!.toLowerCase()))
      )
    )
  }

  private commit(userId: string, entry: Entry | null, recipients = new Set<string>()) {
    const old = this.entries.get(userId)
    const previous = this.audiences.get(userId) ?? new Set<string>()
    if (entry) {
      this.entries.set(userId, entry)
      recipients.add(userId) // Own profile must agree with friends' profiles.
      this.audiences.set(userId, recipients)
    } else {
      this.entries.delete(userId)
      this.audiences.delete(userId)
    }
    this.dirty.delete(userId)
    const changed = JSON.stringify(old?.report) !== JSON.stringify(entry?.report)
    const revision = ++this.revision
    for (const uid of previous) {
      if (!recipients.has(uid)) this.emit(uid, { userId, activity: null, revision })
    }
    if (entry) {
      const { kind, name, details, state, iconUrl, startedAt } = entry.report
      const activity: UserActivity = { kind, name, details, state, iconUrl, startedAt }
      for (const uid of recipients) {
        if (changed || !previous.has(uid)) this.emit(uid, { userId, activity, revision })
      }
    }
  }

  update(userId: string, socketId: string, report: ActivityReport, connected: () => boolean) {
    if (!connected()) return Promise.resolve()
    if (!this.accept(socketId, report.sequence)) return Promise.resolve()
    this.reporters.set(userId, socketId)
    // Sequence is transport state, not part of activity identity or artwork.
    const { sequence: _sequence, ...observation } = report
    return this.run(userId, async (current) => {
      if (!connected()) return
      const old = this.entries.get(userId)
      const now = Date.now()
      let keepOwner = false
      if (old && old.owner !== socketId && old.expiresAt > now) {
        // Stable across renewals: games win over music, then the newer session
        // wins. Socket ID only breaks equal-time ties between desktops.
        const priority =
          (observation.kind === old.report.kind ? 0 : observation.kind === 'game' ? 1 : -1) ||
          (Date.parse(observation.startedAt) || 0) - (Date.parse(old.report.startedAt) || 0) ||
          socketId.localeCompare(old.owner)
        if (priority < 0) {
          if (!this.dirty.has(userId) && now - old.checkedAt < 30_000) {
            this.reporters.set(userId, old.owner)
            return
          }
          keepOwner = true
        }
      }
      if (
        !this.dirty.has(userId) &&
        old?.owner === socketId &&
        old.expiresAt > now &&
        now - old.checkedAt < 30_000 &&
        JSON.stringify(old.report) === JSON.stringify(observation)
      ) {
        old.expiresAt = now + RichActivityTracker.LEASE_MS
        return
      }
      let policy: ActivityPolicy
      try {
        policy = await this.policy(userId)
      } catch (err) {
        if (current() && this.dirty.has(userId)) this.commit(userId, null)
        throw err
      }
      if (!current() || !connected()) return
      if (keepOwner && old) {
        this.reporters.set(userId, old.owner)
        if (this.permitted(old.report, policy))
          this.commit(userId, { ...old, checkedAt: Date.now() }, policy.recipientIds)
        else this.commit(userId, null)
        return
      }
      if (!this.permitted(observation, policy)) {
        if (old && old.owner !== socketId && this.permitted(old.report, policy)) {
          this.reporters.set(userId, old.owner)
          this.commit(userId, old, policy.recipientIds)
        } else this.commit(userId, null)
        return
      }
      this.commit(
        userId,
        {
          report: observation,
          owner: socketId,
          expiresAt: Date.now() + RichActivityTracker.LEASE_MS,
          checkedAt: Date.now()
        },
        policy.recipientIds
      )
    })
  }

  clear(userId: string, socketId: string, sequence?: number) {
    if (!this.accept(socketId, sequence)) return Promise.resolve()
    const owner = this.entries.get(userId)?.owner
    if (owner === socketId && this.reporters.get(userId) !== socketId) {
      // Clear the departing owner without canceling another desktop's pending takeover.
      this.commit(userId, null)
      return Promise.resolve()
    }
    if ((this.reporters.get(userId) ?? this.entries.get(userId)?.owner) !== socketId) return Promise.resolve()
    // Clears never wait behind a database lookup. Invalidate its completion now.
    this.latest.delete(userId)
    const entry = this.entries.get(userId)
    if (entry && entry.owner !== socketId) {
      this.reporters.set(userId, entry.owner)
      if (this.dirty.has(userId)) return this.refresh(userId)
    } else {
      this.commit(userId, null)
      this.reporters.delete(userId)
    }
    return Promise.resolve()
  }

  refresh(userId: string) {
    if (!this.entries.has(userId) && !this.pending.has(userId)) return Promise.resolve()
    this.dirty.add(userId) // Hide from snapshots while privacy is being reconciled.
    return this.run(userId, async (current) => {
      let policy: ActivityPolicy
      try {
        policy = await this.policy(userId)
      } catch (err) {
        if (current()) this.commit(userId, null)
        throw err
      }
      if (!current()) return
      const entry = this.entries.get(userId)
      if (!entry || entry.expiresAt <= Date.now() || !this.permitted(entry.report, policy)) this.commit(userId, null)
      else this.commit(userId, { ...entry, checkedAt: Date.now() }, policy.recipientIds)
    })
  }

  async disconnect(socketId: string) {
    this.sequences.delete(socketId)
    const users = new Set([...this.entries.keys(), ...this.reporters.keys()])
    await Promise.all([...users].map((uid) => this.clear(uid, socketId)))
  }

  async expire() {
    for (const [uid, entry] of this.entries) {
      if (entry.expiresAt > Date.now()) continue
      this.latest.delete(uid)
      this.commit(uid, null)
      this.reporters.delete(uid)
    }
  }

  snapshot(recipientId: string) {
    const activities: Record<string, UserActivity> = {}
    for (const [uid, entry] of this.entries) {
      if (this.dirty.has(uid) || entry.expiresAt <= Date.now() || !this.audiences.get(uid)?.has(recipientId)) continue
      const { kind, name, details, state, iconUrl, startedAt } = entry.report
      activities[uid] = { kind, name, details, state, iconUrl, startedAt }
    }
    return { activities, revision: this.revision }
  }

  activeUserIds() {
    return [...new Set([...this.entries.keys(), ...this.reporters.keys()])]
  }
}
