import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AdminTokenStore } from './admin-token-store'

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly tokenStore: AdminTokenStore) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()

    const token = req.headers['x-admin-token']

    if (!token) {
      throw new UnauthorizedException('Admin token required')
    }

    if (!this.tokenStore.validate(token)) {
      throw new UnauthorizedException('Invalid or expired admin token')
    }

    return true
  }
}
