export interface BotClientOptions {
  token: string
  serverUrl: string
  storagePath?: string
}

export interface CommandDefinition {
  name: string
  description: string
  parameters?: CommandParameter[]
  requiredPermission?: string
}

export interface CommandParameter {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
}

export interface CommandContext {
  serverId: string | null
  conversationId: string | null
  channelId: string
  commandName: string
  args: Record<string, string>
  user: { id: string; username: string; displayName: string | null }
  isDm: boolean
  userPermissions: bigint
  reply: (content: string) => Promise<void>
}

export interface BotReadyData {
  user: { id: string; username: string; displayName: string | null }
  servers: Array<{
    id: string
    name: string
    channels: Array<{ id: string }>
  }>
}

export interface BotMessage {
  id: string
  channelId: string | null
  authorId: string | null
  content: string | null
  createdAt: string
  author?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl: string | null
    isBot?: boolean
  } | null
  webhookId?: string | null
}

export interface BotDmMessage {
  id: string
  conversationId: string
  authorId: string | null
  content: string | null
  createdAt: string
  author?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl: string | null
    isBot?: boolean
  } | null
}

export type BotEventMap = {
  ready: (data: BotReadyData) => void
  messageCreate: (message: BotMessage) => void
  dmMessageCreate: (message: BotDmMessage) => void
  serverRemoved: (data: { serverId: string }) => void
  disconnected: () => void
  error: (error: Error) => void
}

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>
