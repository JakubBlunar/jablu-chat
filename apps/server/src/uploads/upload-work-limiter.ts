import { ServiceUnavailableException } from '@nestjs/common'

type Waiter = { grant: (release: () => void) => void; cancel: () => void }

/** Admission is bounded before retaining another job's file buffer. */
export class UploadWorkLimiter {
  private active = 0
  private readonly waiting: Waiter[] = []

  constructor(private readonly concurrency: number, private readonly maxWaiting: number) {}

  get state() { return { active: this.active, queued: this.waiting.length } }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted()
    if (this.active < this.concurrency) return this.start()
    if (this.waiting.length >= this.maxWaiting) throw new ServiceUnavailableException('Upload processing is busy. Please retry shortly.')
    return new Promise((resolve, reject) => {
      const cancel = () => {
        const index = this.waiting.indexOf(waiter)
        if (index < 0) return
        this.waiting.splice(index, 1)
        cleanup()
        reject(signal?.reason ?? new ServiceUnavailableException('Upload queue timed out. Please retry shortly.'))
      }
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
      const waiter = { grant: (release: () => void) => { cleanup(); resolve(release) }, cancel }
      const timer = setTimeout(cancel, 10_000)
      this.waiting.push(waiter)
      signal?.addEventListener('abort', cancel, { once: true })
    })
  }

  private start() {
    this.active++
    let released = false
    return () => {
      if (released) return
      released = true
      this.active--
      this.waiting.shift()?.grant(this.start())
    }
  }

  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal)
    try { signal?.throwIfAborted(); return await work() } finally { release() }
  }
}
