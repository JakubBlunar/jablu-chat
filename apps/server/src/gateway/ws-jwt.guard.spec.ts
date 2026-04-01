import { WsException } from '@nestjs/websockets'
import { WsJwtGuard } from './ws-jwt.guard'

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard
  let jwt: { verifyAsync: jest.Mock }
  let config: { get: jest.Mock }
  let prisma: { user: { findUnique: jest.Mock } }

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() }
    config = { get: jest.fn().mockReturnValue('test-secret') }
    prisma = { user: { findUnique: jest.fn() } }
    guard = new WsJwtGuard(jwt as any, config as any, prisma as any)
  })

  function makeClient(overrides: { auth?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
    return {
      handshake: {
        auth: overrides.auth ?? {},
        headers: overrides.headers ?? {},
      },
      data: {},
    } as any
  }

  describe('authenticateClient', () => {
    it('extracts token from handshake.auth.token', async () => {
      const client = makeClient({ auth: { token: 'my-jwt' } })
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-1' })
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', username: 'alice', displayName: null })

      const user = await guard.authenticateClient(client)
      expect(user.id).toBe('u-1')
      expect(client.data.user).toBe(user)
    })

    it('extracts Bearer token from authorization header', async () => {
      const client = makeClient({ headers: { authorization: 'Bearer my-jwt' } })
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-1' })
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', username: 'bob', displayName: null })

      const user = await guard.authenticateClient(client)
      expect(user.username).toBe('bob')
    })

    it('extracts raw token from authorization header (no Bearer prefix)', async () => {
      const client = makeClient({ headers: { authorization: 'raw-token' } })
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-1' })
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', username: 'charlie', displayName: null })

      const user = await guard.authenticateClient(client)
      expect(user.username).toBe('charlie')
    })

    it('throws WsException when no token is present', async () => {
      const client = makeClient()
      await expect(guard.authenticateClient(client)).rejects.toThrow(WsException)
    })

    it('throws WsException when JWT verification fails', async () => {
      const client = makeClient({ auth: { token: 'bad-jwt' } })
      jwt.verifyAsync.mockRejectedValue(new Error('invalid'))
      await expect(guard.authenticateClient(client)).rejects.toThrow(WsException)
    })

    it('throws WsException when user not found in DB', async () => {
      const client = makeClient({ auth: { token: 'valid-jwt' } })
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-deleted' })
      prisma.user.findUnique.mockResolvedValue(null)
      await expect(guard.authenticateClient(client)).rejects.toThrow(WsException)
    })
  })

  describe('canActivate', () => {
    it('returns true when user already cached on client.data', async () => {
      const client = makeClient()
      client.data.user = { id: 'u-1', username: 'cached', displayName: null }

      const context = { switchToWs: () => ({ getClient: () => client }) } as any
      expect(await guard.canActivate(context)).toBe(true)
    })

    it('authenticates and returns true for new connections', async () => {
      const client = makeClient({ auth: { token: 'jwt' } })
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-1' })
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', username: 'new', displayName: null })

      const context = { switchToWs: () => ({ getClient: () => client }) } as any
      expect(await guard.canActivate(context)).toBe(true)
      expect(client.data.user).toBeDefined()
    })
  })
})
