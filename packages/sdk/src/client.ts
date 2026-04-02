import { resolve } from 'node:path'
import { CommandRegistry } from './commands.js'
import { GatewayClient } from './gateway.js'
import { RestClient } from './rest.js'
import { BotStorage } from './storage.js'
import type { BotClientOptions, BotEventMap, BotReadyData, CommandDefinition, CommandHandler } from './types.js'

export class BotClient {
  readonly rest: RestClient
  readonly gateway: GatewayClient
  readonly storage: BotStorage

  private commands: CommandRegistry
  private readyData: BotReadyData | null = null
  private readyResolve: (() => void) | null = null
  private onReadyPromise: Promise<void> | null = null

  constructor(options: BotClientOptions) {
    this.rest = new RestClient(options.serverUrl, options.token)
    this.gateway = new GatewayClient(options.serverUrl, options.token)
    this.commands = new CommandRegistry(this.rest)
    this.storage = new BotStorage(options.storagePath ?? resolve(process.cwd(), 'data', 'bot-storage.db'))

    this.gateway.onCommand((data) => {
      void this.commands.handleIncoming(data)
    })
  }

  get user() {
    return this.readyData?.user ?? null
  }

  get servers() {
    return this.readyData?.servers ?? []
  }

  registerCommands(defs: CommandDefinition[]): void {
    this.commands.register(defs)
  }

  onCommand(name: string, handler: CommandHandler): void {
    this.commands.onCommand(name, handler)
  }

  on<K extends keyof BotEventMap>(event: K, listener: BotEventMap[K]): void {
    this.gateway.on(event, listener)
  }

  off<K extends keyof BotEventMap>(event: K, listener: BotEventMap[K]): void {
    this.gateway.off(event, listener)
  }

  async sendMessage(channelId: string, content: string): Promise<any> {
    return this.rest.sendMessage(channelId, content)
  }

  async sendDmMessage(conversationId: string, content: string): Promise<any> {
    return this.rest.sendDmMessage(conversationId, content)
  }

  async editMessage(channelId: string, messageId: string, content: string): Promise<any> {
    return this.rest.editMessage(channelId, messageId, content)
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    return this.rest.deleteMessage(channelId, messageId)
  }

  connect(): Promise<void> {
    if (this.onReadyPromise) return this.onReadyPromise

    this.onReadyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve
    })

    this.gateway.on('ready', (data) => {
      this.readyData = data
      console.log(`[sdk] Connected as ${data.user.username} (${data.servers.length} server(s))`)

      const defs = this.commands.getDefinitions()
      if (defs.length > 0) {
        this.rest
          .syncCommands(defs)
          .then(() => console.log(`[sdk] Synced ${defs.length} command(s)`))
          .catch((err) => console.error('[sdk] Failed to sync commands:', err.message))
      }

      this.readyResolve?.()
    })

    this.gateway.on('serverRemoved', (data) => {
      if (this.readyData) {
        this.readyData.servers = this.readyData.servers.filter((s) => s.id !== data.serverId)
      }
      console.log(`[sdk] Removed from server ${data.serverId}`)
    })

    this.gateway.on('error', (err) => {
      console.error('[sdk] Connection error:', err.message)
    })

    this.gateway.on('disconnected', () => {
      console.log('[sdk] Disconnected, reconnecting...')
    })

    this.gateway.connect()
    return this.onReadyPromise
  }

  disconnect(): void {
    this.gateway.disconnect()
    this.storage.close()
    this.readyData = null
    this.onReadyPromise = null
    this.readyResolve = null
  }
}
