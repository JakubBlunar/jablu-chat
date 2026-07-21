import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type {
  ActivitySettings,
  GameDetectable,
  RegisteredGame as RegisteredGameDto
} from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { UploadsService } from '../uploads/uploads.service'
import { EventBusService } from '../events/event-bus.service'
import { Prisma, type RegisteredGame } from '../prisma-client'
import { GAME_DETECTABLES } from './detectables'
import {
  UpdateActivitySettingsDto,
  UpdateRegisteredGameDto,
  UpsertRegisteredGameDto
} from './dto'

const STEAM_CACHE_TTL = 24 * 60 * 60 // 24h

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly uploads: UploadsService,
    private readonly events: EventBusService
  ) {}

  async getSettings(userId: string): Promise<ActivitySettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        activityShareEnabled: true,
        activityShareOnline: true,
        activityDefaultSharing: true,
        activityShareGames: true,
        activityShareMusic: true
      }
    })
    if (!user) throw new NotFoundException('User not found')
    return {
      shareEnabled: user.activityShareEnabled,
      shareOnline: user.activityShareOnline,
      defaultSharing: user.activityDefaultSharing,
      shareGames: user.activityShareGames,
      shareMusic: user.activityShareMusic
    }
  }

  async updateSettings(userId: string, dto: UpdateActivitySettingsDto): Promise<ActivitySettings> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.shareEnabled !== undefined ? { activityShareEnabled: dto.shareEnabled } : {}),
        ...(dto.shareOnline !== undefined ? { activityShareOnline: dto.shareOnline } : {}),
        ...(dto.defaultSharing !== undefined ? { activityDefaultSharing: dto.defaultSharing } : {}),
        ...(dto.shareGames !== undefined ? { activityShareGames: dto.shareGames } : {}),
        ...(dto.shareMusic !== undefined ? { activityShareMusic: dto.shareMusic } : {})
      }
    })
    return this.getSettings(userId)
  }

  /** Servers where the user has explicitly hidden activity sharing (shareActivity === false). */
  async listHiddenServers(userId: string): Promise<{ hiddenServerIds: string[] }> {
    const rows = await this.prisma.serverMember.findMany({
      where: { userId, shareActivity: false },
      select: { serverId: true }
    })
    return { hiddenServerIds: rows.map((r) => r.serverId) }
  }

  /**
   * Toggle per-server activity sharing. `hidden` writes `shareActivity = false`;
   * un-hiding resets to `null` (follow the user's default sharing scope).
   */
  async setServerHidden(
    userId: string,
    serverId: string,
    hidden: boolean
  ): Promise<{ hidden: boolean }> {
    try {
      await this.prisma.serverMember.update({
        where: { userId_serverId: { userId, serverId } },
        data: { shareActivity: hidden ? false : null }
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Server membership not found')
      }
      throw err
    }
    this.events.emit('activity:server-scope-changed', { userId, serverId })
    return { hidden }
  }

  async listGames(userId: string): Promise<RegisteredGameDto[]> {
    const rows = await this.prisma.registeredGame.findMany({
      where: { userId },
      orderBy: [{ lastPlayedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
    })
    return rows.map((r) => this.toDto(r))
  }

  async upsertGame(userId: string, dto: UpsertRegisteredGameDto): Promise<RegisteredGameDto> {
    const row = await this.prisma.registeredGame.upsert({
      where: { userId_name: { userId, name: dto.name } },
      create: {
        userId,
        name: dto.name,
        source: dto.source ?? 'manual',
        executable: dto.executable ?? null,
        steamAppId: dto.steamAppId ?? null,
        iconUrl: dto.iconUrl ?? null,
        verified: dto.verified ?? dto.source !== 'manual',
        lastPlayedAt: new Date()
      },
      update: {
        lastPlayedAt: new Date(),
        // Only backfill metadata; never clobber existing values with nulls.
        ...(dto.executable ? { executable: dto.executable } : {}),
        ...(dto.steamAppId ? { steamAppId: dto.steamAppId } : {}),
        ...(dto.iconUrl ? { iconUrl: dto.iconUrl } : {}),
        ...(dto.source ? { source: dto.source, verified: dto.verified ?? dto.source !== 'manual' } : {})
      }
    })
    return this.toDto(row)
  }

  async updateGame(
    userId: string,
    id: string,
    dto: UpdateRegisteredGameDto
  ): Promise<RegisteredGameDto> {
    const existing = await this.prisma.registeredGame.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('Game not found')
    const row = await this.prisma.registeredGame.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.hidden !== undefined ? { hidden: dto.hidden } : {}),
        ...(dto.iconUrl !== undefined ? { iconUrl: dto.iconUrl } : {})
      }
    })
    return this.toDto(row)
  }

  async deleteGame(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.registeredGame.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('Game not found')
    await this.prisma.registeredGame.delete({ where: { id } })
  }

  getDetectables(): GameDetectable[] {
    return GAME_DETECTABLES
  }

  /** Resolves a Steam appid to a display name + header/icon art, cached in Redis. */
  async resolveSteam(appId: string): Promise<{ name: string; iconUrl: string; headerUrl: string } | null> {
    if (!/^\d+$/.test(appId)) throw new BadRequestException('Invalid Steam appid')
    const cacheKey = `steam:app:${appId}`
    const cached = await this.redis.client.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const headerUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
    let name = ''
    let iconUrl = headerUrl
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (res.ok) {
        const data = (await res.json()) as Record<string, { success?: boolean; data?: { name?: string; header_image?: string; capsule_image?: string } }>
        const entry = data?.[appId]
        if (entry?.success && entry.data) {
          name = entry.data.name ?? ''
          iconUrl = entry.data.capsule_image ?? entry.data.header_image ?? headerUrl
        }
      }
    } catch (err) {
      this.logger.warn(`Steam resolve ${appId} failed: ${(err as Error)?.message}`)
    }

    const result = { name, iconUrl, headerUrl }
    await this.redis.client.setex(cacheKey, STEAM_CACHE_TTL, JSON.stringify(result))
    return result
  }

  /** Stores a base64 activity icon and returns a stable URL. */
  async saveIcon(dataUrl: string, key: string): Promise<{ url: string }> {
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl)
    if (!match) throw new BadRequestException('Invalid data URL')
    const buffer = Buffer.from(match[1], 'base64')
    if (buffer.length === 0 || buffer.length > 1_500_000) {
      throw new BadRequestException('Icon too large or empty')
    }
    const url = await this.uploads.saveActivityIcon(buffer, key)
    return { url }
  }

  private toDto(r: RegisteredGame): RegisteredGameDto {
    return {
      id: r.id,
      name: r.name,
      source: r.source,
      executable: r.executable,
      steamAppId: r.steamAppId,
      iconUrl: r.iconUrl,
      verified: r.verified,
      hidden: r.hidden,
      lastPlayedAt: r.lastPlayedAt ? r.lastPlayedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString()
    }
  }
}
