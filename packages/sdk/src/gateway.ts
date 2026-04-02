import { io, Socket } from 'socket.io-client'
import type { BotDmMessage, BotEventMap, BotMessage, BotReadyData } from './types.js'

type Listener<K extends keyof BotEventMap> = BotEventMap[K]

export class GatewayClient {
  private socket: Socket | null = null
  private serverUrl: string
  private token: string
  private listeners = new Map<string, Set<(...args: any[]) => void>>()
  private commandCallback: ((data: any) => void) | null = null
  botUserId: string | null = null

  constructor(serverUrl: string, token: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this.token = token
  }

  connect(): void {
    this.socket = io(this.serverUrl, {
      auth: { token: this.token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000
    })

    this.socket.on('bot:ready', (data: BotReadyData) => {
      this.botUserId = data.user.id
      this.emit('ready', data)
    })

    this.socket.on('message:new', (message: BotMessage) => {
      this.emit('messageCreate', message)
    })

    this.socket.on('dm:new', (message: BotDmMessage) => {
      if (message.authorId !== this.botUserId) {
        this.emit('dmMessageCreate', message)
      }
    })

    this.socket.on('bot:command', (data: any) => {
      if (this.commandCallback) {
        this.commandCallback(data)
      }
    })

    this.socket.on('member:left', (data: { serverId: string; userId: string }) => {
      if (this.botUserId && data.userId === this.botUserId) {
        this.emit('serverRemoved', { serverId: data.serverId })
      }
    })

    this.socket.on('disconnect', () => {
      this.emit('disconnected')
    })

    this.socket.on('connect_error', (err: Error) => {
      this.emit('error', err)
    })
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
  }

  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  onCommand(callback: (data: any) => void): void {
    this.commandCallback = callback
  }

  on<K extends keyof BotEventMap>(event: K, listener: Listener<K>): void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as any)
  }

  off<K extends keyof BotEventMap>(event: K, listener: Listener<K>): void {
    this.listeners.get(event)?.delete(listener as any)
  }

  private emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of set) {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[sdk] Error in ${event} listener:`, err)
      }
    }
  }
}
