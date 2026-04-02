import type { CommandContext, CommandDefinition, CommandHandler } from './types.js'
import type { RestClient } from './rest.js'

function parseBigInt(value?: string): bigint {
  if (!value) return 0n
  try { return BigInt(value) } catch { return 0n }
}

export class CommandRegistry {
  private definitions: CommandDefinition[] = []
  private handlers = new Map<string, CommandHandler>()
  private rest: RestClient

  constructor(rest: RestClient) {
    this.rest = rest
  }

  register(commands: CommandDefinition[]): void {
    this.definitions = commands
  }

  onCommand(name: string, handler: CommandHandler): void {
    this.handlers.set(name.toLowerCase(), handler)
  }

  getDefinitions(): CommandDefinition[] {
    return this.definitions
  }

  async handleIncoming(data: {
    serverId?: string
    conversationId?: string
    channelId: string
    commandName: string
    args: Record<string, string>
    user: { id: string; username: string; displayName: string | null }
    userPermissions?: string
  }): Promise<void> {
    const normalizedName = data.commandName.toLowerCase()
    const handler = this.handlers.get(normalizedName)
    if (!handler) return

    const isDm = !data.serverId && !!data.conversationId

    const ctx: CommandContext = {
      serverId: data.serverId ?? null,
      conversationId: data.conversationId ?? null,
      channelId: data.channelId,
      commandName: normalizedName,
      args: data.args,
      user: data.user,
      isDm,
      userPermissions: parseBigInt(data.userPermissions),
      reply: async (content: string) => {
        if (isDm && data.conversationId) {
          await this.rest.sendDmMessage(data.conversationId, content)
        } else {
          await this.rest.sendMessage(data.channelId, content)
        }
      }
    }

    try {
      await handler(ctx)
    } catch (err) {
      console.error(`[sdk] Error in command handler '${normalizedName}':`, err)
    }
  }
}
