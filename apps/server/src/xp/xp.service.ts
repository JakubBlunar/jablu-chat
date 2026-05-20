import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { EventBusService } from '../events/event-bus.service'

const XP_PER_MESSAGE_MIN = 15
const XP_PER_MESSAGE_MAX = 25
const XP_COOLDOWN_SECONDS = 60
const LEADERBOARD_DEFAULT_LIMIT = 25
const LEADERBOARD_MAX_LIMIT = 100

/**
 * XP required to advance from `level` to `level + 1` (Mee6-ish curve).
 * Level 0 → 1 costs 100 XP; every subsequent level costs a little more.
 */
export function xpForLevel(level: number): number {
  const clamped = Math.max(0, level)
  return 5 * clamped * clamped + 50 * clamped + 100
}

/** Cumulative XP needed to *reach* a given level from 0. */
export function totalXpForLevel(level: number): number {
  let total = 0
  for (let l = 0; l < level; l++) total += xpForLevel(l)
  return total
}

/** Compute level reachable with a given total XP. */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 0
  let level = 0
  let remaining = xp
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level++
    if (level > 1000) break
  }
  return level
}

export interface AwardResult {
  awarded: number
  xp: number
  level: number
  leveledUp: boolean
}

@Injectable()
export class XpService {
  private readonly logger = new Logger(XpService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventBusService
  ) {}

  private cooldownKey(serverId: string, userId: string) {
    return `xp:cd:${serverId}:${userId}`
  }

  /**
   * Try to award XP for a channel message. Returns null when:
   * - the server has XP disabled
   * - the user is on cooldown (one award per XP_COOLDOWN_SECONDS)
   * - the member row is missing
   */
  async tryAwardForMessage(serverId: string, userId: string): Promise<AwardResult | null> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { xpEnabled: true }
    })
    if (!server?.xpEnabled) return null

    try {
      // SET NX EX: atomically claim the cooldown slot.
      const ok = await this.redis.client.set(
        this.cooldownKey(serverId, userId),
        '1',
        'EX',
        XP_COOLDOWN_SECONDS,
        'NX'
      )
      if (ok !== 'OK') return null
    } catch (err) {
      // If Redis is unavailable we prefer to silently skip awarding over
      // granting XP on every message (which would defeat rate limiting).
      this.logger.warn(`XP cooldown skipped (redis unavailable): ${(err as Error).message}`)
      return null
    }

    const awarded = randomInt(XP_PER_MESSAGE_MIN, XP_PER_MESSAGE_MAX)

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { xp: true, level: true }
    })
    if (!member) return null

    const newXp = member.xp + awarded
    const newLevel = levelFromXp(newXp)
    const leveledUp = newLevel > member.level

    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId, serverId } },
      data: {
        xp: newXp,
        level: newLevel,
        lastXpAt: new Date()
      }
    })

    if (leveledUp) {
      this.events.emit('xp:level-up', {
        serverId,
        userId,
        level: newLevel,
        xp: newXp
      })
    }

    return { awarded, xp: newXp, level: newLevel, leveledUp }
  }

  async getMemberProgress(serverId: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { xpEnabled: true }
    })
    if (!server) throw new NotFoundException('Server not found')
    if (!server.xpEnabled) {
      throw new ForbiddenException('Leveling is disabled for this server')
    }

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { xp: true, level: true }
    })
    if (!member) throw new NotFoundException('Member not found')

    const currentLevelFloor = totalXpForLevel(member.level)
    const xpIntoLevel = member.xp - currentLevelFloor
    const xpNeededForLevel = xpForLevel(member.level)

    return {
      xp: member.xp,
      level: member.level,
      xpIntoLevel: Math.max(0, xpIntoLevel),
      xpNeededForLevel,
      nextLevelAt: currentLevelFloor + xpNeededForLevel
    }
  }

  async getLeaderboard(serverId: string, viewerUserId: string, limit?: number) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { xpEnabled: true }
    })
    if (!server) throw new NotFoundException('Server not found')
    if (!server.xpEnabled) {
      throw new ForbiddenException('Leveling is disabled for this server')
    }

    const viewerMember = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: viewerUserId, serverId } },
      select: { userId: true }
    })
    if (!viewerMember) throw new ForbiddenException('You are not a member of this server')

    const take = Math.min(Math.max(1, limit ?? LEADERBOARD_DEFAULT_LIMIT), LEADERBOARD_MAX_LIMIT)

    const rows = await this.prisma.serverMember.findMany({
      where: { serverId, xp: { gt: 0 } },
      orderBy: [{ xp: 'desc' }, { joinedAt: 'asc' }],
      take,
      select: {
        userId: true,
        xp: true,
        level: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isBot: true
          }
        }
      }
    })

    return rows.map((r, idx) => ({
      rank: idx + 1,
      userId: r.userId,
      xp: r.xp,
      level: r.level,
      user: r.user
    }))
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
