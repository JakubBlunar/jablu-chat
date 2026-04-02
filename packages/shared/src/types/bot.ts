export interface BotApplication {
  id: string
  name: string
  description: string | null
  public: boolean
  userId: string
  ownerId: string
  createdAt: string
  updatedAt: string
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
}

export interface BotCommandParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required: boolean
}

export interface BotCommand {
  id: string
  botAppId: string
  name: string
  description: string
  parameters: BotCommandParam[]
  requiredPermission: string | null
  createdAt: string
}

export interface BotCommandWithBot extends BotCommand {
  bot: {
    id: string
    name: string
    user: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
    }
  }
}
