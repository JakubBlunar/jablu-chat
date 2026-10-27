export class PreviewAdmissionError extends Error {}
type Job = { owner: string; signal: AbortSignal; start: () => void; cancel: () => void }

/** One process-wide budget; round-robin owners cannot occupy all active slots. */
export class PreviewWorkQueue {
  private active = 0
  private readonly ownerActive = new Map<string, number>()
  private readonly groups = new Map<string, Job[]>()
  private queued = 0

  get state() {
    return { active: this.active, queued: this.queued }
  }

  run<T>(owner: string, work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason)
    const group = this.groups.get(owner) ?? []
    if (this.queued >= 32 || group.length >= 8) return Promise.reject(new PreviewAdmissionError('Preview queue full'))
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', job.cancel)
      }
      const remove = () => {
        const queue = this.groups.get(owner)
        const index = queue?.indexOf(job) ?? -1
        if (index < 0) return false
        queue!.splice(index, 1)
        this.queued--
        if (!queue!.length) this.groups.delete(owner)
        return true
      }
      const job: Job = {
        owner,
        signal,
        cancel: () => {
          if (!remove()) return
          cleanup()
          reject(signal.aborted ? signal.reason : new PreviewAdmissionError('Preview queue deadline'))
          this.dispatch()
        },
        start: () => {
          cleanup()
          this.active++
          this.ownerActive.set(owner, (this.ownerActive.get(owner) ?? 0) + 1)
          Promise.resolve()
            .then(() => {
              signal.throwIfAborted()
              return work()
            })
            .then(resolve, reject)
            .finally(() => {
              this.active--
              const count = this.ownerActive.get(owner)! - 1
              if (count) this.ownerActive.set(owner, count)
              else this.ownerActive.delete(owner)
              this.dispatch()
            })
        }
      }
      const timer = setTimeout(job.cancel, 5_000)
      signal.addEventListener('abort', job.cancel, { once: true })
      group.push(job)
      this.groups.set(owner, group)
      this.queued++
      this.dispatch()
    })
  }

  private dispatch() {
    while (this.active < 4) {
      const candidate = [...this.groups.entries()].find(([owner]) => (this.ownerActive.get(owner) ?? 0) < 2)
      if (!candidate) return
      const [owner, jobs] = candidate
      const job = jobs.shift()!
      this.groups.delete(owner)
      if (jobs.length) this.groups.set(owner, jobs)
      this.queued--
      job.start()
    }
  }
}

export const previewWorkQueue = new PreviewWorkQueue()
