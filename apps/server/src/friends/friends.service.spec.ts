import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FriendsService } from './friends.service'
import { PrismaService } from '../prisma/prisma.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('FriendsService', () => {
  let service: FriendsService
  let prisma: MockPrismaService

  const userA = 'user-a'
  const userB = 'user-b'

  const mockFriendship = {
    id: 'fr-1',
    requesterId: userA,
    addresseeId: userB,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    requester: { id: userA, username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null, status: 'online', customStatus: null },
    addressee: { id: userB, username: 'bob', displayName: 'Bob', avatarUrl: null, bio: null, status: 'online', customStatus: null },
  }

  beforeEach(async () => {
    prisma = createMockPrismaService()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()

    service = module.get(FriendsService)
  })

  describe('sendRequest', () => {
    it('throws when sending request to yourself', async () => {
      await expect(service.sendRequest(userA, userA)).rejects.toThrow(BadRequestException)
    })

    it('throws when already friends', async () => {
      prisma.friendship.findFirst.mockResolvedValue({ ...mockFriendship, status: 'accepted' })
      await expect(service.sendRequest(userA, userB)).rejects.toThrow('Already friends')
    })

    it('throws when pending request exists', async () => {
      prisma.friendship.findFirst.mockResolvedValue(mockFriendship)
      await expect(service.sendRequest(userA, userB)).rejects.toThrow('Friend request already exists')
    })

    it('creates a friend request', async () => {
      prisma.friendship.findFirst.mockResolvedValue(null)
      prisma.friendship.create.mockResolvedValue(mockFriendship)

      const result = await service.sendRequest(userA, userB)
      expect(result).toEqual(mockFriendship)
      expect(prisma.friendship.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { requesterId: userA, addresseeId: userB } }),
      )
    })
  })

  describe('acceptRequest', () => {
    it('throws when friendship not found', async () => {
      prisma.friendship.findUnique.mockResolvedValue(null)
      await expect(service.acceptRequest('fr-1', userB)).rejects.toThrow(NotFoundException)
    })

    it('throws when user is not the addressee', async () => {
      prisma.friendship.findUnique.mockResolvedValue(mockFriendship)
      await expect(service.acceptRequest('fr-1', userA)).rejects.toThrow('Only the recipient can accept')
    })

    it('throws when already accepted', async () => {
      prisma.friendship.findUnique.mockResolvedValue({ ...mockFriendship, status: 'accepted' })
      await expect(service.acceptRequest('fr-1', userB)).rejects.toThrow('Already accepted')
    })

    it('accepts the request', async () => {
      prisma.friendship.findUnique.mockResolvedValue(mockFriendship)
      const accepted = { ...mockFriendship, status: 'accepted' }
      prisma.friendship.update.mockResolvedValue(accepted)

      const result = await service.acceptRequest('fr-1', userB)
      expect(result.status).toBe('accepted')
    })
  })

  describe('declineRequest', () => {
    it('throws when friendship not found', async () => {
      prisma.friendship.findUnique.mockResolvedValue(null)
      await expect(service.declineRequest('fr-1', userB)).rejects.toThrow(NotFoundException)
    })

    it('throws when user is not the addressee', async () => {
      prisma.friendship.findUnique.mockResolvedValue(mockFriendship)
      await expect(service.declineRequest('fr-1', userA)).rejects.toThrow('Only the recipient can decline')
    })

    it('throws when friendship is already accepted', async () => {
      prisma.friendship.findUnique.mockResolvedValue({ ...mockFriendship, status: 'accepted' })
      await expect(service.declineRequest('fr-1', userB)).rejects.toThrow('Cannot decline an accepted friendship')
    })

    it('deletes the request', async () => {
      prisma.friendship.findUnique.mockResolvedValue(mockFriendship)
      prisma.friendship.delete.mockResolvedValue({})

      const result = await service.declineRequest('fr-1', userB)
      expect(result).toEqual({ friendshipId: 'fr-1', requesterId: userA, addresseeId: userB })
    })
  })

  describe('cancelRequest', () => {
    it('throws when friendship not found', async () => {
      prisma.friendship.findUnique.mockResolvedValue(null)
      await expect(service.cancelRequest('fr-1', userA)).rejects.toThrow(NotFoundException)
    })

    it('throws when user is not the requester', async () => {
      prisma.friendship.findUnique.mockResolvedValue(mockFriendship)
      await expect(service.cancelRequest('fr-1', userB)).rejects.toThrow('Only the sender can cancel')
    })

    it('throws when already accepted', async () => {
      prisma.friendship.findUnique.mockResolvedValue({ ...mockFriendship, status: 'accepted' })
      await expect(service.cancelRequest('fr-1', userA)).rejects.toThrow('Cannot cancel an accepted friendship')
    })

    it('deletes the request', async () => {
      prisma.friendship.findUnique.mockResolvedValue(mockFriendship)
      prisma.friendship.delete.mockResolvedValue({})

      const result = await service.cancelRequest('fr-1', userA)
      expect(result.friendshipId).toBe('fr-1')
    })
  })

  describe('removeFriend', () => {
    const accepted = { ...mockFriendship, status: 'accepted' }

    it('throws when not found', async () => {
      prisma.friendship.findUnique.mockResolvedValue(null)
      await expect(service.removeFriend('fr-1', userA)).rejects.toThrow(NotFoundException)
    })

    it('throws when user is not part of the friendship', async () => {
      prisma.friendship.findUnique.mockResolvedValue(accepted)
      await expect(service.removeFriend('fr-1', 'stranger')).rejects.toThrow('Not part of this friendship')
    })

    it('throws when not accepted', async () => {
      prisma.friendship.findUnique.mockResolvedValue(mockFriendship) // pending
      await expect(service.removeFriend('fr-1', userA)).rejects.toThrow('Not friends')
    })

    it('removes and returns other user ID (requester removes)', async () => {
      prisma.friendship.findUnique.mockResolvedValue(accepted)
      prisma.friendship.delete.mockResolvedValue({})

      const result = await service.removeFriend('fr-1', userA)
      expect(result).toEqual({ friendshipId: 'fr-1', userId: userA, otherUserId: userB })
    })

    it('removes and returns other user ID (addressee removes)', async () => {
      prisma.friendship.findUnique.mockResolvedValue(accepted)
      prisma.friendship.delete.mockResolvedValue({})

      const result = await service.removeFriend('fr-1', userB)
      expect(result.otherUserId).toBe(userA)
    })
  })

  describe('areFriends', () => {
    it('returns true for same user', async () => {
      expect(await service.areFriends(userA, userA)).toBe(true)
    })

    it('returns true when friendship exists', async () => {
      prisma.friendship.count.mockResolvedValue(1)
      expect(await service.areFriends(userA, userB)).toBe(true)
    })

    it('returns false when no friendship', async () => {
      prisma.friendship.count.mockResolvedValue(0)
      expect(await service.areFriends(userA, userB)).toBe(false)
    })
  })

  describe('getFriendIds', () => {
    it('returns a Set of friend IDs (both directions)', async () => {
      prisma.friendship.findMany.mockResolvedValue([
        { requesterId: userA, addresseeId: 'f1' },
        { requesterId: 'f2', addresseeId: userA },
      ])

      const ids = await service.getFriendIds(userA)
      expect(ids).toEqual(new Set(['f1', 'f2']))
    })

    it('returns empty set when no friends', async () => {
      prisma.friendship.findMany.mockResolvedValue([])
      const ids = await service.getFriendIds(userA)
      expect(ids.size).toBe(0)
    })
  })

  describe('getFriendshipBetween', () => {
    it('returns none when no relationship', async () => {
      prisma.friendship.findFirst.mockResolvedValue(null)
      const result = await service.getFriendshipBetween(userA, userB)
      expect(result).toEqual({ status: 'none', friendshipId: null })
    })

    it('returns friends when accepted', async () => {
      prisma.friendship.findFirst.mockResolvedValue({ ...mockFriendship, status: 'accepted' })
      const result = await service.getFriendshipBetween(userA, userB)
      expect(result).toEqual({ status: 'friends', friendshipId: 'fr-1' })
    })

    it('returns pending_outgoing when userA is requester', async () => {
      prisma.friendship.findFirst.mockResolvedValue(mockFriendship)
      const result = await service.getFriendshipBetween(userA, userB)
      expect(result).toEqual({ status: 'pending_outgoing', friendshipId: 'fr-1' })
    })

    it('returns pending_incoming when userA is addressee', async () => {
      prisma.friendship.findFirst.mockResolvedValue({
        ...mockFriendship,
        requesterId: userB,
        addresseeId: userA,
      })
      const result = await service.getFriendshipBetween(userA, userB)
      expect(result).toEqual({ status: 'pending_incoming', friendshipId: 'fr-1' })
    })
  })

  describe('getFriends', () => {
    it('returns mapped friend list', async () => {
      prisma.friendship.findMany.mockResolvedValue([{
        id: 'fr-1',
        requesterId: userA,
        addresseeId: userB,
        status: 'accepted',
        updatedAt: new Date('2024-06-01'),
        addressee: { id: userB, username: 'bob', displayName: 'Bob', avatarUrl: null, bio: 'hi', status: 'online' },
        requester: { id: userA, username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null, status: 'online' },
      }])

      const friends = await service.getFriends(userA)
      expect(friends).toHaveLength(1)
      expect(friends[0].id).toBe(userB)
      expect(friends[0].username).toBe('bob')
      expect(friends[0].friendshipId).toBe('fr-1')
    })
  })

  describe('getPendingRequests', () => {
    it('returns mapped pending requests with direction', async () => {
      prisma.friendship.findMany.mockResolvedValue([
        {
          id: 'fr-1',
          requesterId: 'someone',
          addresseeId: userA,
          status: 'pending',
          createdAt: new Date('2024-06-01'),
          requester: { id: 'someone', username: 'sam', displayName: 'Sam', avatarUrl: null, status: 'online' },
          addressee: { id: userA, username: 'alice', displayName: 'Alice', avatarUrl: null, status: 'online' },
        },
      ])

      const reqs = await service.getPendingRequests(userA)
      expect(reqs).toHaveLength(1)
      expect(reqs[0].direction).toBe('incoming')
      expect(reqs[0].user.username).toBe('sam')
    })
  })
})
