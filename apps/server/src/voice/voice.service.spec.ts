import { VoiceService } from './voice.service'

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(function (this: any) {
    this.grants = []
    this.addGrant = jest.fn((grant: any) => { this.grants.push(grant) })
    this.toJwt = jest.fn().mockResolvedValue('mock-jwt-token')
  })
}))

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    LIVEKIT_API_KEY: 'key123',
    LIVEKIT_API_SECRET: 'secret456',
    LIVEKIT_URL: 'wss://lk.example.com',
    ...overrides
  }
  return { get: (key: string, fallback = '') => values[key] ?? fallback } as any
}

describe('VoiceService', () => {
  describe('isConfigured', () => {
    it('returns true when all three env vars are set', () => {
      const service = new VoiceService(makeConfig())
      expect(service.isConfigured).toBe(true)
    })

    it('returns false when API key is missing', () => {
      const service = new VoiceService(makeConfig({ LIVEKIT_API_KEY: '' }))
      expect(service.isConfigured).toBe(false)
    })

    it('returns false when API secret is missing', () => {
      const service = new VoiceService(makeConfig({ LIVEKIT_API_SECRET: '' }))
      expect(service.isConfigured).toBe(false)
    })

    it('returns false when URL is missing', () => {
      const service = new VoiceService(makeConfig({ LIVEKIT_URL: '' }))
      expect(service.isConfigured).toBe(false)
    })
  })

  describe('generateToken', () => {
    it('returns a JWT token and the LiveKit URL', async () => {
      const service = new VoiceService(makeConfig())
      const result = await service.generateToken('user1', 'alice', 'ch-voice')

      expect(result.token).toBe('mock-jwt-token')
      expect(result.url).toBe('wss://lk.example.com')
    })

    it('creates an AccessToken with correct identity and name', async () => {
      const { AccessToken } = require('livekit-server-sdk')
      const service = new VoiceService(makeConfig())

      await service.generateToken('user1', 'alice', 'ch-voice')

      expect(AccessToken).toHaveBeenCalledWith('key123', 'secret456', {
        identity: 'user1',
        name: 'alice'
      })
    })

    it('grants the correct room permissions', async () => {
      const { AccessToken } = require('livekit-server-sdk')
      const service = new VoiceService(makeConfig())

      await service.generateToken('user1', 'alice', 'ch-voice')

      const instance = AccessToken.mock.instances[AccessToken.mock.instances.length - 1]
      expect(instance.addGrant).toHaveBeenCalledWith({
        room: 'voice:ch-voice',
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      })
    })
  })
})
