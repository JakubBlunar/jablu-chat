import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  WsException,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export type WsUser = { id: string; username: string; displayName: string | null };

function extractToken(client: Socket): string | null {
  const auth = client.handshake.auth as Record<string, unknown> | undefined;
  if (auth && typeof auth.token === 'string' && auth.token.length > 0) {
    return auth.token;
  }
  const raw = client.handshake.headers.authorization;
  if (typeof raw !== 'string' || !raw) {
    return null;
  }
  const parts = raw.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1] ?? null;
  }
  if (parts.length === 1) {
    return parts[0] ?? null;
  }
  return null;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticateClient(client: Socket): Promise<WsUser> {
    const token = extractToken(client);
    if (!token) {
      throw new WsException('Unauthorized');
    }
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new WsException('Unauthorized');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, displayName: true },
    });
    if (!user) {
      throw new WsException('Unauthorized');
    }
    const data = client.data as { user?: WsUser };
    data.user = user;
    return user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const data = client.data as { user?: WsUser };
    if (!data.user) {
      await this.authenticateClient(client);
    }
    return true;
  }
}
