import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Permission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'
import { reassemble, textSegments, tokenize } from './translation.segments'

const RATE_LIMIT = 60
const RATE_WINDOW = 60
const MAX_CONTENT_CHARS = 8000
const MAX_SEGMENTS = 100
const LT_TIMEOUT_MS = 30_000

/**
 * Human names for the languages we expect to ship. The canonical list comes
 * from the env (TRANSLATE_LANGUAGES); unknown codes fall back to the code.
 */
const KNOWN_NAMES: Record<string, string> = {
  en: 'English',
  cs: 'Czech',
  sk: 'Slovak',
  de: 'German',
  pl: 'Polish',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian'
}

interface LTResponse {
  translatedText: string | string[]
  detectedLanguage?: { language?: string; confidence?: number } | { language?: string; confidence?: number }[]
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name)
  private readonly url: string
  private readonly languages: string[]

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly roles: RolesService
  ) {
    this.url = (this.config.get<string>('TRANSLATE_URL') ?? '').replace(/\/+$/, '')
    // Canonical order: keep the configured order, lower-case, de-dupe.
    const raw = (this.config.get<string>('TRANSLATE_LANGUAGES') ?? 'en,cs,sk')
    this.languages = [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]
  }

  isEnabled(): boolean {
    return this.url.length > 0 && this.languages.length > 0
  }

  getLanguages(): string[] {
    return this.languages
  }

  /** Shape for the client capability probe. */
  capabilities() {
    if (!this.isEnabled()) {
      return { enabled: false, languages: [] }
    }
    const langs = this.languages
    return {
      enabled: true,
      languages: langs.map((code) => ({
        code,
        name: KNOWN_NAMES[code] ?? code,
        targets: langs.filter((t) => t !== code)
      }))
    }
  }

  async getPreference(userId: string): Promise<{ targetLang: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { translationTargetLang: true }
    })
    const stored = user?.translationTargetLang ?? null
    return { targetLang: stored && this.languages.includes(stored) ? stored : null }
  }

  async setPreference(userId: string, targetLang: string | undefined): Promise<{ targetLang: string | null }> {
    if (targetLang != null && targetLang !== '') {
      const lang = targetLang.toLowerCase()
      if (!this.languages.includes(lang)) {
        throw new BadRequestException(`Unsupported language: ${targetLang}`)
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { translationTargetLang: lang }
      })
      return { targetLang: lang }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { translationTargetLang: null }
    })
    return { targetLang: null }
  }

  async translateMessage(
    userId: string,
    messageId: string,
    targetLang?: string
  ): Promise<{
    content: string
    targetLang: string
    detectedLang: string | null
    sourceLang: string | null
  }> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Translation is not configured')
    }

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, content: true, channelId: true, directConversationId: true, deleted: true }
    })
    if (!msg || msg.deleted || !msg.content) {
      throw new NotFoundException('Message not found')
    }

    await this.assertCanViewMessage(userId, msg)

    const target = await this.resolveTarget(userId, targetLang)

    const tokens = tokenize(msg.content)
    const batch = textSegments(tokens)
    const totalChars = batch.reduce((n, s) => n + s.length, 0)
    if (totalChars > MAX_CONTENT_CHARS) {
      throw new BadRequestException('Message is too long to translate')
    }
    if (batch.length > MAX_SEGMENTS) {
      throw new BadRequestException('Message has too many parts to translate')
    }
    // Nothing to translate (e.g. a message that is only a link or code block).
    if (batch.every((s) => s.trim().length === 0)) {
      throw new BadRequestException('No translatable text in message')
    }

    // The MT engine strips whitespace from batch elements, and rejoining the
    // result without it fuses code/URLs into words. Send only each segment's
    // trimmed core; restore the surrounding whitespace on reassembly.
    const parts = batch.map((seg) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(seg)
      return { lead: m?.[1] ?? '', core: m?.[2] ?? '', trail: m?.[3] ?? '' }
    })

    await this.checkRateLimit(userId)

    const { trs, detected } = await this.translateBatch(parts.map((p) => p.core), target)
    const finalTrs = parts.map((p, i) => {
      const coreTr = trs[i]
      if (!p.core) return null
      return coreTr && coreTr.trim() ? p.lead + coreTr + p.trail : null
    })

    return {
      content: reassemble(tokens, finalTrs),
      targetLang: target,
      detectedLang: detected,
      sourceLang: detected
    }
  }

  private async resolveTarget(userId: string, requested?: string): Promise<string> {
    if (requested) {
      const lang = requested.toLowerCase()
      if (!this.languages.includes(lang)) {
        throw new BadRequestException(`Unsupported language: ${requested}`)
      }
      return lang
    }
    const pref = await this.getPreference(userId)
    if (pref.targetLang) return pref.targetLang
    // No preference stored — the client should have sent an explicit target;
    // default to the first configured language (usually "en").
    return this.languages[0]
  }

  private async assertCanViewMessage(
    userId: string,
    msg: { channelId: string | null; directConversationId: string | null }
  ) {
    if (msg.channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: msg.channelId },
        select: { id: true, serverId: true }
      })
      if (!channel) throw new NotFoundException('Channel not found')
      await this.roles.requireChannelPermission(channel.serverId, channel.id, userId, Permission.VIEW_CHANNEL)
      return
    }
    if (msg.directConversationId) {
      const member = await this.prisma.directConversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: msg.directConversationId,
            userId
          }
        }
      })
      if (!member) throw new ForbiddenException('Not a member of this conversation')
      return
    }
    throw new ForbiddenException('Message is not accessible')
  }

  private async checkRateLimit(userId: string) {
    const key = `rl:translate:${userId}`
    try {
      const count = await this.redis.client.incr(key)
      if (count === 1) await this.redis.client.expire(key, RATE_WINDOW)
      if (count > RATE_LIMIT) {
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS)
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new ServiceUnavailableException('Translation service temporarily unavailable')
    }
  }

  private async translateBatch(batch: string[], target: string): Promise<{ trs: string[]; detected: string | null }> {
    const body = { q: batch, source: 'auto', target }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LT_TIMEOUT_MS)
    try {
      const res = await fetch(`${this.url}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      if (!res.ok) {
        this.logger.warn(`LibreTranslate responded ${res.status}`)
        throw new ServiceUnavailableException('Translation service error')
      }
      const data = (await res.json()) as LTResponse
      let detected: string | null = null
      if (data.detectedLanguage && typeof data.detectedLanguage === 'object' && !Array.isArray(data.detectedLanguage)) {
        detected = data.detectedLanguage.language ?? null
      } else if (Array.isArray(data.detectedLanguage) && data.detectedLanguage.length > 0) {
        detected = data.detectedLanguage[0]?.language ?? null
      }
      if (!Array.isArray(data.translatedText)) {
        // Single-text fallback (defensive; batch always returns an array)
        return { trs: [typeof data.translatedText === 'string' ? data.translatedText : batch[0]], detected }
      }
      return {
        trs: data.translatedText.map((t, i) => (typeof t === 'string' ? t : batch[i] ?? '')),
        detected
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ServiceUnavailableException('Translation timed out')
      }
      this.logger.warn(`LibreTranslate request failed: ${String(err)}`)
      throw new ServiceUnavailableException('Translation service unavailable')
    } finally {
      clearTimeout(timer)
    }
  }
}
