import { Permission } from '@chat/shared'
import { createChannelRecipientPlan } from './channel-recipient-plan'
import type { PrismaService } from '../prisma/prisma.service'
import type { RolesService } from '../roles/roles.service'

it('shares membership and visibility within one delivery without retaining another message authorization', async () => {
  const findMany = jest.fn().mockResolvedValue([
    { userId: 'human', notifLevel: 'all', user: { isBot: false } },
    { userId: 'bot', notifLevel: 'mentions', user: { isBot: true } }
  ])
  const permissions = jest.fn().mockResolvedValue(new Map([['human', Permission.VIEW_CHANNEL], ['bot', 0n]]))
  const prisma = { serverMember: { findMany } } as unknown as PrismaService
  const roles = { getChannelPermissionsForUsers: permissions } as unknown as RolesService
  const plan = createChannelRecipientPlan(prisma, roles, 'server', 'channel', 'sender')
  await Promise.all([plan.members(), plan.permissionsFor(['human']), plan.permissionsFor(['human', 'bot'])])
  expect(findMany).toHaveBeenCalledTimes(1)
  expect(permissions).toHaveBeenCalledTimes(1)
  expect((await plan.members())[1].isBot).toBe(true)
  const next = createChannelRecipientPlan(prisma, roles, 'server', 'channel', 'sender')
  await next.permissionsFor(['human'])
  expect(permissions).toHaveBeenCalledTimes(2)
})
