import { BadRequestException, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'
import { TranslationService } from './translation.service'

const USER_ID = 'user-1'
const CHANNEL_ID = 'ch-1'
const SERVER_ID = 'srv-1'
const MSG_ID = 'msg-1'

function createService(overrides: Partial<{ config: Record<string, string>; message: Record<string, unknown> }> = {}) {
  const config = {
    get: (key: string) => {
      const all: Record<string, string> = {
        TRANSLATE_URL: 'http://lt.local:5000/',
        TRANSLATE_LANGUAGES: 'en,cs,sk',
        ...overrides.config
      }
      return all[key]
    }
  } as unknown as ConfigService

  const requireChannelPermission = jest.fn().mockResolvedValue(undefined)
  const roles = { requireChannelPermission } as unknown as RolesService

  const redisClient = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1)
  }
  const redis = { client: redisClient } as unknown as RedisService

  const messageRow = {
    id: MSG_ID,
    content: 'Hello world',
    channelId: CHANNEL_ID,
    directConversationId: null,
    deleted: null,
    ...overrides.message
  }
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ translationTargetLang: null }),
      update: jest.fn().mockResolvedValue({})
    },
    message: { findUnique: jest.fn().mockResolvedValue(messageRow) },
    channel: {
      findUnique: jest.fn().mockResolvedValue({ id: CHANNEL_ID, serverId: SERVER_ID })
    },
    directConversationMember: { findUnique: jest.fn().mockResolvedValue({}) }
  } as unknown as PrismaService

  const service = new TranslationService(config, prisma, redis, roles)
  return { service, prisma, redisClient, requireChannelPermission }
}

describe('TranslationService', () => {
  it('reports capabilities from env with targets excluding self', () => {
    const { service } = createService()
    expect(service.isEnabled()).toBe(true)
    expect(service.capabilities()).toEqual({
      enabled: true,
      languages: [
        { code: 'en', name: 'English', targets: ['cs', 'sk'] },
        { code: 'cs', name: 'Czech', targets: ['en', 'sk'] },
        { code: 'sk', name: 'Slovak', targets: ['en', 'cs'] }
      ]
    })
  })

  it('is disabled when TRANSLATE_URL is empty', () => {
    const { service } = createService({ config: { TRANSLATE_URL: '' } })
    expect(service.isEnabled()).toBe(false)
    expect(service.capabilities()).toEqual({ enabled: false, languages: [] })
  })

  it('rejects translation when disabled', async () => {
    const { service } = createService({ config: { TRANSLATE_URL: '' } })
    await expect(service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('throws 404 for missing/deleted/empty messages', async () => {
    const missing = createService()
    ;(missing.prisma.message.findUnique as jest.Mock).mockResolvedValueOnce(null)
    await expect(missing.service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(NotFoundException)

    const deleted = createService({ message: { deleted: true } })
    await expect(deleted.service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(NotFoundException)

    const empty = createService({ message: { content: '' } })
    await expect(empty.service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('denies channel messages the user cannot view', async () => {
    const { service, requireChannelPermission } = createService()
    requireChannelPermission.mockRejectedValueOnce(new ForbiddenException())
    await expect(service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(ForbiddenException)
    expect(requireChannelPermission).toHaveBeenCalledWith(SERVER_ID, CHANNEL_ID, USER_ID, expect.anything())
  })

  it('denies DM messages for non-members', async () => {
    const { service, prisma } = createService({
      message: { channelId: null, directConversationId: 'dm-1' }
    })
    ;(prisma.directConversationMember.findUnique as jest.Mock).mockResolvedValueOnce(null)
    await expect(service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects unsupported target languages', async () => {
    const { service } = createService()
    await expect(service.translateMessage(USER_ID, MSG_ID, 'fr')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects messages with no translatable text', async () => {
    const { service } = createService({
      message: { content: 'https://example.com/some/path' }
    })
    await expect(service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects overly long messages', async () => {
    const { service } = createService({
      message: { content: 'word '.repeat(3000) }
    })
    await expect(service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toThrow('too long')
  })

  it('translates a message, preserving markdown, and reports detected language', async () => {
    const { service } = createService({
      message: { content: 'Hello **world**, see [docs](https://jablu.dev/docs) and `code` here.\n\n- item one' }
    })
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        translatedText: ['Dobrý **svět**, viz', 'dokumenty', 'and', 'zde.', '', 'položka jedna'],
        detectedLanguage: [{ language: 'en', confidence: 0.99 }]
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await service.translateMessage(USER_ID, MSG_ID, 'cs')
    expect(result.targetLang).toBe('cs')
    expect(result.detectedLang).toBe('en')
    // Emphasis stays in-context; code + URL stay verbatim; surrounding
    // whitespace is restored even though the engine strips it.
    expect(result.content).toBe(
      'Dobrý **svět**, viz [dokumenty](https://jablu.dev/docs) and `code` zde.\n\n- položka jedna'
    )
    // The MT request is a batch of the trimmed text cores only.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.source).toBe('auto')
    expect(body.target).toBe('cs')
    expect(body.q).toEqual(['Hello **world**, see', 'docs', 'and', 'here.', '', 'item one'])
    // URLs and code never reach the engine.
    expect(JSON.stringify(body)).not.toContain('jablu.dev')
    expect(JSON.stringify(body)).not.toContain('`')
    // Rate limit bookkeeping happened before the MT call.
    expect((service as unknown as { redis: { client: { incr: jest.Mock } } }).redis.client.incr).toHaveBeenCalled()
  })

  it('falls back to the stored preference when no explicit target is given', async () => {
    const { service, prisma } = createService()
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ translationTargetLang: 'sk' })
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ translatedText: ['Dobré ráno'], detectedLanguage: { language: 'en', confidence: 0.9 } })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await service.translateMessage(USER_ID, MSG_ID)
    expect(result.targetLang).toBe('sk')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.target).toBe('sk')
  })

  it('maps LT 5xx / network / timeout failures to 503', async () => {
    const notFound = createService()
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })
    await expect(notFound.service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(ServiceUnavailableException)

    const boom = createService()
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(boom.service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('enforces the per-user rate limit via Redis INCR', async () => {
    const { service, redisClient } = createService()
    ;(redisClient.incr as jest.Mock).mockResolvedValueOnce(61)
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn()
    await expect(service.translateMessage(USER_ID, MSG_ID, 'cs')).rejects.toMatchObject({ status: 429 })
    expect(redisClient.incr).toHaveBeenCalledWith('rl:translate:user-1')
    expect((global as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled()
  })

  it('stores/clears the language preference (validated against env)', async () => {
    const { service, prisma } = createService()
    await expect(service.setPreference(USER_ID, 'cs')).resolves.toEqual({ targetLang: 'cs' })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { translationTargetLang: 'cs' }
    })

    await expect(service.setPreference(USER_ID, 'fr')).rejects.toBeInstanceOf(BadRequestException)

    await expect(service.setPreference(USER_ID, '')).resolves.toEqual({ targetLang: null })
    expect(prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: USER_ID },
      data: { translationTargetLang: null }
    })
  })

  it('ignores stored preferences for languages outside the env list', async () => {
    const { service, prisma } = createService()
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({ translationTargetLang: 'fr' })
    await expect(service.getPreference(USER_ID)).resolves.toEqual({ targetLang: null })
  })
})
