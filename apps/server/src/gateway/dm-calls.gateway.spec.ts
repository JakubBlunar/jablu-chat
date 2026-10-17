import { type ExecutionContext, ForbiddenException, type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { DmCall, DmCallReply } from '@chat/shared'
import type { Socket } from 'socket.io'
import { DmService } from '../dm/dm.service'
import { PrismaService } from '../prisma/prisma.service'
import { DmCallsService } from '../voice/dm-calls.service'
import { VoiceService } from '../voice/voice.service'
import { NotificationsService } from '../notifications/notifications.service'
import { DmCallsGateway } from './dm-calls.gateway'
import { WsJwtGuard } from './ws-jwt.guard'
import { WsThrottleGuard } from './ws-throttle.guard'

const conversationId = '00000000-0000-4000-8000-000000000001'

class SignalingClient {
  private readonly socket: WebSocket
  private readonly ready: Promise<void>
  private nextId = 0
  private readonly pending = new Map<number, (reply: unknown) => void>()
  private readonly listeners = new Map<string, (payload: unknown) => void>()

  constructor(url: string, user: string) {
    this.socket = new WebSocket(`${url.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket&user=${user}`)
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('error', reject, { once: true })
      this.socket.addEventListener('message', (event) => {
        const message = String(event.data)
        if (message.startsWith('0')) this.socket.send('40')
        else if (message.startsWith('40')) resolve()
        else if (message === '2') this.socket.send('3')
        else if (message.startsWith('42')) {
          const [name, payload] = JSON.parse(message.slice(2))
          this.listeners.get(name)?.(payload)
        } else if (message.startsWith('43')) {
          const index = message.indexOf('[')
          const id = Number(message.slice(2, index))
          const [reply] = JSON.parse(message.slice(index))
          this.pending.get(id)?.(reply)
          this.pending.delete(id)
        }
      })
    })
  }

  async request<T>(event: string, payload: object = {}): Promise<DmCallReply<T>> {
    await this.ready
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => reject(new Error(`No acknowledgement for ${event}`)), 3000)
      this.pending.set(id, (reply) => {
        clearTimeout(timer)
        resolve(reply as DmCallReply<T>)
      })
      this.socket.send(`42${id}${JSON.stringify([event, payload])}`)
    })
  }

  once<T>(event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${event} event`)), 3000)
      this.listeners.set(event, (payload) => {
        clearTimeout(timer)
        this.listeners.delete(event)
        resolve(payload as T)
      })
    })
  }

  close() {
    this.socket.close()
  }
}

describe('DM call signaling over WebSocket', () => {
  let app: INestApplication
  let url: string
  const clients: SignalingClient[] = []

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DmCallsGateway,
        DmCallsService,
        {
          provide: DmService,
          useValue: {
            requireMembership: async (_id: string, userId: string) => {
              if (!['alice', 'bob'].includes(userId)) throw new ForbiddenException('Not a conversation member')
            }
          }
        },
        {
          provide: PrismaService,
          useValue: {
            directConversationMember: {
              findMany: async () =>
                ['alice', 'bob'].map((userId) => ({ userId, conversationId, user: { isBot: false } }))
            }
          }
        },
        { provide: VoiceService, useValue: { isConfigured: true, deleteDmRoom: async () => {} } },
        { provide: NotificationsService, useValue: { dispatch: async () => {} } }
      ]
    })
      .overrideGuard(WsJwtGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const client = context.switchToWs().getClient<Socket>()
          const id = String(client.handshake.query.user)
          client.data.user = { id, username: id, displayName: null }
          void client.join(`user:${id}`)
          return true
        }
      })
      .overrideGuard(WsThrottleGuard)
      .useValue({ canActivate: () => true })
      .compile()
    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.listen(0, '127.0.0.1')
    url = await app.getUrl()
  })

  afterEach(() => {
    for (const client of clients.splice(0)) client.close()
  })

  afterAll(async () => {
    await app.close()
  })

  async function client(user: string) {
    const client = new SignalingClient(url, user)
    clients.push(client)
    await client.request('dm:call:sync')
    return client
  }

  it('rings every recipient device, accepts on one, and broadcasts hangup', async () => {
    const alice = await client('alice')
    const bob = await client('bob')
    const bobPhone = await client('bob')
    const ringing = bob.once<DmCall>('dm:call:update')
    const phoneRinging = bobPhone.once<DmCall>('dm:call:update')
    const started = await alice.request<DmCall>('dm:call:start', { conversationId })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.error)
    const call = started.data
    expect((await ringing).ringingUserIds).toEqual(['bob'])
    expect((await phoneRinging).id).toBe(call.id)

    const phoneAccepted = bobPhone.once<DmCall>('dm:call:update')
    const accepted = await bob.request<DmCall>('dm:call:accept', { callId: call.id })
    expect(accepted.ok).toBe(true)
    expect((await phoneAccepted).ringingUserIds).toEqual([])
    const secondDevice = await bobPhone.request('dm:call:accept', { callId: call.id })
    expect(secondDevice).toEqual({ ok: false, error: 'You already joined this call on another device' })

    const ended = alice.once<{ callId: string; reason: string }>('dm:call:ended')
    expect((await bob.request('dm:call:leave', { callId: call.id })).ok).toBe(true)
    expect(await ended).toMatchObject({ callId: call.id, reason: 'hangup' })
  })

  it('rejects nonmember actions and validates call IDs before the handler', async () => {
    const stranger = await client('stranger')
    expect(await stranger.request('dm:call:start', { conversationId })).toEqual({
      ok: false,
      error: 'Not a conversation member'
    })
    const exception = stranger.once<{ message: string }>('exception')
    // An invalid DTO produces the repository-standard exception event rather than an ack.
    const invalid = stranger.request('dm:call:accept', { callId: 'not-a-uuid' }).catch(() => undefined)
    expect((await exception).message).toContain('callId must be a UUID')
    stranger.close()
    await invalid
  })
})
