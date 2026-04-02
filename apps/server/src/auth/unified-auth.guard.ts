import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class UnifiedAuthGuard extends AuthGuard(['jwt', 'bot-token']) {
  handleRequest(err: any, user: any, _info: any, _context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException()
    }
    return user
  }
}
