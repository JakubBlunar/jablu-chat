import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly password: string;

  constructor(private readonly config: ConfigService) {
    this.password = config.get<string>('SUPERADMIN_PASSWORD', '');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.password) {
      throw new UnauthorizedException('Superadmin password not configured');
    }

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const header = req.headers['x-admin-password'];

    if (!header) {
      throw new UnauthorizedException('Admin password required');
    }

    const a = Buffer.from(header);
    const b = Buffer.from(this.password);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid admin password');
    }

    return true;
  }
}
