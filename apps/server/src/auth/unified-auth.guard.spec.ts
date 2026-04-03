import { UnauthorizedException } from '@nestjs/common'
import { UnifiedAuthGuard } from './unified-auth.guard'

describe('UnifiedAuthGuard', () => {
  let guard: UnifiedAuthGuard

  beforeEach(() => {
    guard = new UnifiedAuthGuard()
  })

  it('returns the user when present', () => {
    const user = { id: 'u1', username: 'alice' }
    const result = guard.handleRequest(null, user, null, {} as any)
    expect(result).toEqual(user)
  })

  it('throws the original error when present', () => {
    const origError = new Error('Strategy error')
    expect(() => guard.handleRequest(origError, null, null, {} as any)).toThrow(origError)
  })

  it('throws UnauthorizedException when no user and no error', () => {
    expect(() => guard.handleRequest(null, null, null, {} as any)).toThrow(UnauthorizedException)
  })

  it('prefers the error over UnauthorizedException', () => {
    const customError = new Error('Custom')
    expect(() => guard.handleRequest(customError, { id: 'u1' }, null, {} as any)).toThrow(customError)
  })
})
