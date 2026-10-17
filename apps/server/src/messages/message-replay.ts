import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { messageInclude } from './message-wire'

type Destination = {
  channelId?: string
  conversationId?: string
  threadParentId?: string
}

export async function findMessageReplay(
  prisma: { message: Pick<PrismaService['message'], 'findUnique'> },
  clientMessageId: string | undefined,
  userId: string,
  destination: Destination
) {
  if (!clientMessageId) return null
  const message = await prisma.message.findUnique({
    where: { id: clientMessageId },
    include: messageInclude
  })
  if (!message) return null
  if (
    message.authorId !== userId ||
    message.channelId !== (destination.channelId ?? null) ||
    message.directConversationId !== (destination.conversationId ?? null) ||
    message.threadParentId !== (destination.threadParentId ?? null)
  ) {
    throw new BadRequestException('This message ID has already been used')
  }
  return message
}
