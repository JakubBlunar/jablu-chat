import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { Poll as PollType, PollOptionWithVotes } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { messageInclude, mapMessageToWire } from './message-wire'

@Injectable()
export class PollsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPoll(
    channelId: string,
    userId: string,
    question: string,
    options: string[],
    multiSelect: boolean,
    expiresAt?: string
  ) {
    if (options.length < 2 || options.length > 10) {
      throw new BadRequestException('Polls must have 2-10 options')
    }
    if (!question.trim()) {
      throw new BadRequestException('Question is required')
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, type: true }
    })
    if (!channel || channel.type !== 'text') {
      throw new NotFoundException('Text channel not found')
    }

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } }
    })
    if (!member) throw new ForbiddenException('Not a server member')

    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          channelId,
          authorId: userId,
          content: null
        },
        include: messageInclude
      })

      const poll = await tx.poll.create({
        data: {
          messageId: message.id,
          question: question.trim(),
          multiSelect,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          options: {
            create: options.map((label, i) => ({ label: label.trim(), position: i }))
          }
        },
        include: {
          options: { orderBy: { position: 'asc' }, include: { votes: true } }
        }
      })

      return { message, poll }
    })

    const wire = mapMessageToWire(result.message)
    return {
      ...wire,
      poll: this.mapPollToWire(result.poll, userId)
    }
  }

  async votePoll(pollId: string, optionId: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        message: { select: { channelId: true, channel: { select: { serverId: true } } } },
        options: { include: { votes: true } }
      }
    })
    if (!poll) throw new NotFoundException('Poll not found')

    if (poll.expiresAt && poll.expiresAt < new Date()) {
      throw new BadRequestException('This poll has expired')
    }

    const serverId = poll.message.channel?.serverId
    if (serverId) {
      const member = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } }
      })
      if (!member) throw new ForbiddenException('Not a server member')
    }

    const option = poll.options.find((o) => o.id === optionId)
    if (!option) throw new NotFoundException('Option not found')

    const existingVote = await this.prisma.pollVote.findUnique({
      where: { optionId_userId: { optionId, userId } }
    })

    if (existingVote) {
      await this.prisma.pollVote.delete({
        where: { optionId_userId: { optionId, userId } }
      })
    } else {
      if (!poll.multiSelect) {
        await this.prisma.pollVote.deleteMany({
          where: {
            userId,
            option: { pollId: poll.id }
          }
        })
      }
      await this.prisma.pollVote.create({
        data: { optionId, userId }
      })
    }

    const updated = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: { orderBy: { position: 'asc' }, include: { votes: true } }
      }
    })
    if (!updated) throw new NotFoundException('Poll not found')

    return {
      poll: this.mapPollToWire(updated, userId),
      channelId: poll.message.channelId
    }
  }

  async getPoll(pollId: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: { orderBy: { position: 'asc' }, include: { votes: true } }
      }
    })
    if (!poll) throw new NotFoundException('Poll not found')
    return this.mapPollToWire(poll, userId)
  }

  private mapPollToWire(
    poll: {
      id: string
      messageId: string
      question: string
      multiSelect: boolean
      expiresAt: Date | null
      createdAt: Date
      options: Array<{
        id: string
        label: string
        position: number
        votes: Array<{ optionId: string; userId: string }>
      }>
    },
    currentUserId: string
  ): PollType {
    return {
      id: poll.id,
      messageId: poll.messageId,
      question: poll.question,
      multiSelect: poll.multiSelect,
      expiresAt: poll.expiresAt?.toISOString() ?? null,
      createdAt: poll.createdAt.toISOString(),
      options: poll.options.map(
        (o): PollOptionWithVotes => ({
          id: o.id,
          label: o.label,
          position: o.position,
          voteCount: o.votes.length,
          voted: o.votes.some((v) => v.userId === currentUserId)
        })
      )
    }
  }
}
