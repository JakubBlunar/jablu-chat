import { UnauthorizedException } from '@nestjs/common'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminTokenStore } from './admin-token-store'

describe('AdminAuthGuard', () => {
  let guard: AdminAuthGuard
  let tokenStore: { validate: jest.Mock }

  function makeContext(headers: Record<string, string | undefined>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as any
  }

  beforeEach(() => {
    tokenStore = { validate: jest.fn() }
    guard = new AdminAuthGuard(tokenStore as unknown as AdminTokenStore)
  })

  it('returns true when token is valid', () => {
    tokenStore.validate.mockReturnValue(true)
    const ctx = makeContext({ 'x-admin-token': 'valid-token' })

    expect(guard.canActivate(ctx)).toBe(true)
    expect(tokenStore.validate).toHaveBeenCalledWith('valid-token')
  })

  it('throws UnauthorizedException when token header is missing', () => {
    const ctx = makeContext({})

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
    expect(() => guard.canActivate(ctx)).toThrow('Admin token required')
  })

  it('throws UnauthorizedException when token is invalid', () => {
    tokenStore.validate.mockReturnValue(false)
    const ctx = makeContext({ 'x-admin-token': 'bad-token' })

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
    expect(() => guard.canActivate(ctx)).toThrow('Invalid or expired admin token')
  })
})
