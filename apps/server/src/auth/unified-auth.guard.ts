import { ExecutionContext, Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common'
import { AuthGuard, AuthModuleOptions } from '@nestjs/passport'

@Injectable()
export class UnifiedAuthGuard extends AuthGuard(['jwt', 'bot-token']) {
  // Nest reads inherited constructor paramtypes but only own `@Optional()` markers, so a guard
  // that inherits the AuthGuard mixin constructor would demand AuthModuleOptions from every
  // module that uses it. Redeclaring the parameter here keeps it optional.
  constructor(@Optional() @Inject(AuthModuleOptions) options?: AuthModuleOptions) {
    super(options)
  }

  handleRequest(err: any, user: any, _info: any, _context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException()
    }
    return user
  }
}
