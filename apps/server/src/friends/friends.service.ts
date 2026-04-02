import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Friend, FriendRequest, FriendshipStatusResponse } from '@chat/shared'

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  status: true,
  customStatus: true
} as const

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) {
      throw new BadRequestException('Cannot send a friend request to yourself')
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: addresseeId },
      select: { isBot: true }
    })
    if (targetUser?.isBot) {
      throw new BadRequestException('Cannot send a friend request to a bot')
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId }
        ]
      }
    })

    if (existing) {
      if (existing.status === 'accepted') {
        throw new BadRequestException('Already friends')
      }
      throw new BadRequestException('Friend request already exists')
    }

    const friendship = await this.prisma.friendship.create({
      data: { requesterId, addresseeId },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } }
    })

    return friendship
  }

  async acceptRequest(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } }
    })

    if (!friendship) throw new NotFoundException('Friend request not found')
    if (friendship.addresseeId !== userId) throw new BadRequestException('Only the recipient can accept')
    if (friendship.status === 'accepted') throw new BadRequestException('Already accepted')

    const updated = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'accepted' },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } }
    })

    return updated
  }

  async declineRequest(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } })
    if (!friendship) throw new NotFoundException('Friend request not found')
    if (friendship.addresseeId !== userId) throw new BadRequestException('Only the recipient can decline')
    if (friendship.status === 'accepted') throw new BadRequestException('Cannot decline an accepted friendship')

    await this.prisma.friendship.delete({ where: { id: friendshipId } })
    return { friendshipId, requesterId: friendship.requesterId, addresseeId: friendship.addresseeId }
  }

  async cancelRequest(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } })
    if (!friendship) throw new NotFoundException('Friend request not found')
    if (friendship.requesterId !== userId) throw new BadRequestException('Only the sender can cancel')
    if (friendship.status === 'accepted') throw new BadRequestException('Cannot cancel an accepted friendship')

    await this.prisma.friendship.delete({ where: { id: friendshipId } })
    return { friendshipId, requesterId: friendship.requesterId, addresseeId: friendship.addresseeId }
  }

  async removeFriend(friendshipId: string, userId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } })
    if (!friendship) throw new NotFoundException('Friendship not found')
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      throw new BadRequestException('Not part of this friendship')
    }
    if (friendship.status !== 'accepted') throw new BadRequestException('Not friends')

    await this.prisma.friendship.delete({ where: { id: friendshipId } })
    const otherUserId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId
    return { friendshipId, userId, otherUserId }
  }

  async getFriends(userId: string): Promise<Friend[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } },
      orderBy: { updatedAt: 'desc' }
    })

    return rows.map((r) => {
      const other = r.requesterId === userId ? r.addressee : r.requester
      return {
        friendshipId: r.id,
        id: other.id,
        username: other.username,
        displayName: other.displayName,
        avatarUrl: other.avatarUrl,
        bio: other.bio,
        status: other.status,
        since: r.updatedAt.toISOString()
      }
    })
  }

  async getPendingRequests(userId: string): Promise<FriendRequest[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'pending', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } },
      orderBy: { createdAt: 'desc' }
    })

    return rows.map((r) => {
      const isIncoming = r.addresseeId === userId
      const other = isIncoming ? r.requester : r.addressee
      return {
        friendshipId: r.id,
        user: {
          id: other.id,
          username: other.username,
          displayName: other.displayName,
          avatarUrl: other.avatarUrl,
          status: other.status
        },
        direction: isIncoming ? 'incoming' : 'outgoing',
        createdAt: r.createdAt.toISOString()
      }
    })
  }

  async areFriends(userA: string, userB: string): Promise<boolean> {
    if (userA === userB) return true
    const count = await this.prisma.friendship.count({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: userA, addresseeId: userB },
          { requesterId: userB, addresseeId: userA }
        ]
      }
    })
    return count > 0
  }

  async getFriendIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true }
    })
    const ids = new Set<string>()
    for (const r of rows) {
      ids.add(r.requesterId === userId ? r.addresseeId : r.requesterId)
    }
    return ids
  }

  async getFriendshipBetween(userA: string, userB: string): Promise<FriendshipStatusResponse> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userA, addresseeId: userB },
          { requesterId: userB, addresseeId: userA }
        ]
      }
    })

    if (!friendship) return { status: 'none', friendshipId: null }
    if (friendship.status === 'accepted') return { status: 'friends', friendshipId: friendship.id }
    if (friendship.requesterId === userA) return { status: 'pending_outgoing', friendshipId: friendship.id }
    return { status: 'pending_incoming', friendshipId: friendship.id }
  }
}
