import type { Channel, ChannelCategory, Message, Server } from '@chat/shared'
import type { DmConversation } from '@/lib/api'
import { makeChannel, makeMessage, makeServer } from './factories'

/**
 * A seeded stand-in for `api` that resolves from fixtures and records every
 * call.
 *
 * A cache is only correct if the right content is on screen *and* the request
 * that would have fetched it did not happen, so tests need to assert on both.
 * A flat `jest.fn()` cannot express the first across a multi-hop journey.
 */

export type SeedChannel = {
  id: string
  name?: string
  type?: Channel['type']
  position?: number
  isArchived?: boolean
  categoryId?: string | null
  messages: Message[]
}

export type SeedServer = {
  id: string
  channels: SeedChannel[]
  categories?: ChannelCategory[]
  /** Channel id to permission bitfield in wire form. Defaults to full access. */
  permissions?: Record<string, string>
}

export type SeedDm = {
  id: string
  messages: Message[]
}

export type Seed = {
  servers: SeedServer[]
  dms?: SeedDm[]
}

export type RecordedCall = { path: string; at: number }

const ALL_PERMISSIONS = (~0n & ((1n << 64n) - 1n)).toString()

export class FakeApi {
  readonly calls: RecordedCall[] = []

  /** Paths matching these resolve only when the test releases them. */
  private deferred = new Map<string, Array<(value: unknown) => void>>()
  private deferredPatterns: string[] = []

  /** Paths matching these reject with the given status. */
  private failures = new Map<string, number>()

  private servers = new Map<string, SeedServer>()
  private channels = new Map<string, { serverId: string; seed: SeedChannel }>()
  private dms = new Map<string, SeedDm>()

  constructor(seed: Seed) {
    for (const server of seed.servers) {
      this.servers.set(server.id, server)
      for (const channel of server.channels) {
        this.channels.set(channel.id, { serverId: server.id, seed: channel })
      }
    }
    for (const dm of seed.dms ?? []) this.dms.set(dm.id, dm)
  }

  // ── Assertions ─────────────────────────────────────────────────────────────

  callsFor(pathFragment: string): RecordedCall[] {
    return this.calls.filter((c) => c.path.includes(pathFragment))
  }

  countFor(pathFragment: string): number {
    return this.callsFor(pathFragment).length
  }

  reset(): void {
    this.calls.length = 0
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  /** Hold every matching request open until `release` is called. */
  defer(pathFragment: string): void {
    this.deferredPatterns.push(pathFragment)
  }

  release(pathFragment: string): void {
    this.deferredPatterns = this.deferredPatterns.filter((p) => p !== pathFragment)
    for (const [key, resolvers] of this.deferred) {
      if (!key.includes(pathFragment)) continue
      this.deferred.delete(key)
      for (const resolve of resolvers) resolve(this.resolveNow(key))
    }
  }

  failWith(pathFragment: string, status: number): void {
    this.failures.set(pathFragment, status)
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  private async dispatch<T>(path: string): Promise<T> {
    this.calls.push({ path, at: Date.now() })

    for (const [fragment, status] of this.failures) {
      if (path.includes(fragment)) {
        const err = new Error(`Request failed with ${status}`) as Error & { status: number }
        err.status = status
        throw err
      }
    }

    if (this.deferredPatterns.some((p) => path.includes(p))) {
      return new Promise<T>((resolve) => {
        const existing = this.deferred.get(path) ?? []
        existing.push(resolve as (value: unknown) => void)
        this.deferred.set(path, existing)
      })
    }

    return this.resolveNow(path) as T
  }

  private resolveNow(path: string): unknown {
    const [pathname, query = ''] = path.split('?')

    if (pathname === '/api/servers') {
      return [...this.servers.keys()].map((id) => makeServer(id)) satisfies Server[]
    }

    const serverChannels = pathname.match(/^\/api\/servers\/([^/]+)\/channels$/)
    if (serverChannels) {
      const server = this.servers.get(serverChannels[1])
      if (!server) return []
      return server.channels.map((c, index) =>
        makeChannel(c.id, server.id, {
          name: c.name ?? c.id,
          type: c.type ?? 'text',
          position: c.position ?? index,
          isArchived: c.isArchived ?? false,
          categoryId: c.categoryId ?? null
        })
      )
    }

    const serverCategories = pathname.match(/^\/api\/servers\/([^/]+)\/categories$/)
    if (serverCategories) return this.servers.get(serverCategories[1])?.categories ?? []

    if (/^\/api\/servers\/[^/]+\/members$/.test(pathname)) return []
    if (/^\/api\/servers\/[^/]+\/emojis$/.test(pathname)) return []

    const serverPermissions = pathname.match(/^\/api\/servers\/([^/]+)\/channel-permissions$/)
    if (serverPermissions) {
      const server = this.servers.get(serverPermissions[1])
      return (
        server?.permissions ??
        Object.fromEntries((server?.channels ?? []).map((c) => [c.id, ALL_PERMISSIONS]))
      )
    }

    const channelMessages = pathname.match(/^\/api\/channels\/([^/]+)\/messages$/)
    if (channelMessages) return this.messagePage(this.channels.get(channelMessages[1])?.seed.messages ?? [], query)

    const dmMessages = pathname.match(/^\/api\/dm\/([^/]+)\/messages$/)
    if (dmMessages) return this.messagePage(this.dms.get(dmMessages[1])?.messages ?? [], query)

    throw new Error(`FakeApi has no fixture for ${path}`)
  }

  /** The server returns newest-first, which the stores reverse. */
  private messagePage(messages: Message[], query: string) {
    const limit = Number(new URLSearchParams(query).get('limit') ?? 50)
    const newestFirst = [...messages].reverse()
    return { messages: newestFirst.slice(0, limit), hasMore: newestFirst.length > limit, hasNewer: false }
  }

  // ── ApiClient surface used by the stores ───────────────────────────────────

  get = <T>(path: string): Promise<T> => this.dispatch<T>(path)

  getAllChannelPermissions = (serverId: string): Promise<Record<string, string>> =>
    this.dispatch<Record<string, string>>(`/api/servers/${serverId}/channel-permissions`)

  getEmojis = (serverId: string): Promise<unknown[]> =>
    this.dispatch<unknown[]>(`/api/servers/${serverId}/emojis`)

  getDmMessages = (conversationId: string, cursor?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return this.dispatch<{ messages: Message[]; hasMore: boolean; hasNewer?: boolean }>(
      `/api/dm/${conversationId}/messages?${params}`
    )
  }

  getDmConversations = (): Promise<DmConversation[]> => Promise.resolve([])
}

/** Convenience for seeding a channel with n messages carrying stable ids. */
export function seedMessages(channelId: string, count: number): Message[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage({
      id: `${channelId}-m${i + 1}`,
      channelId,
      content: `${channelId} message ${i + 1}`,
      createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString()
    })
  )
}
