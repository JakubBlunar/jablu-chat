import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { WsException } from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { hashBotToken } from '../auth/bot-token.strategy'
import { PrismaService } from '../prisma/prisma.service'

export type WsUser = { id: string; username: string; displayName: string | null; isBot?: boolean; botAppId?: string }

function extractToken(client: Socket): { type: 'jwt' | 'bot'; value: string } | null {
  const auth = client.handshake.auth as Record<string, unknown> | undefined
  if (auth && typeof auth.token === 'string' && auth.token.length > 0) {
    const token = auth.token
    if (token.startsWith('bot_')) {
      return { type: 'bot', value: token }
    }
    return { type: 'jwt', value: token }
  }
  const raw = client.handshake.headers.authorization
  if (typeof raw !== 'string' || !raw) {
    return null
  }
  if (raw.startsWith('Bot ')) {
    return { type: 'bot', value: raw.slice(4).trim() }
  }
  const parts = raw.split(' ')
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return { type: 'jwt', value: parts[1]! }
  }
  if (parts.length === 1) {
    return { type: 'jwt', value: parts[0]! }
  }
  return null
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async authenticateClient(client: Socket): Promise<WsUser> {
    const extracted = extractToken(client)
    if (!extracted) {
      throw new WsException('Unauthorized')
    }

    if (extracted.type === 'bot') {
      return this.authenticateBot(client, extracted.value)
    }

    return this.authenticateJwt(client, extracted.value)
  }

  private async authenticateJwt(client: Socket, token: string): Promise<WsUser> {
    let payload: { sub: string }
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET')
      })
    } catch {
      throw new WsException('Unauthorized')
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, displayName: true, isBot: true }
    })
    if (!user) {
      throw new WsException('Unauthorized')
    }
    const wsUser: WsUser = { id: user.id, username: user.username, displayName: user.displayName }
    const data = client.data as { user?: WsUser }
    data.user = wsUser
    return wsUser
  }

  private async authenticateBot(client: Socket, token: string): Promise<WsUser> {
    const tokenHash = hashBotToken(token)
    const botApp = await this.prisma.botApplication.findFirst({
      where: { tokenHash },
      select: {
        id: true,
        user: { select: { id: true, username: true, displayName: true } }
      }
    })
    if (!botApp) {
      throw new WsException('Unauthorized')
    }
    const wsUser: WsUser = {
      id: botApp.user.id,
      username: botApp.user.username,
      displayName: botApp.user.displayName,
      isBot: true,
      botAppId: botApp.id
    }
    const data = client.data as { user?: WsUser }
    data.user = wsUser
    return wsUser
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>()
    const data = client.data as { user?: WsUser }
    if (!data.user) {
      await this.authenticateClient(client)
    }
    return true
  }
}
