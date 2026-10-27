import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { ConflictException } from '@nestjs/common'
import { PrismaClient } from '../prisma-client'
import type { PrismaService } from '../prisma/prisma.service'
import { EventBusService } from '../events/event-bus.service'
import { RolesService } from '../roles/roles.service'
import { ForumPostsService } from './forum-posts.service'

const url = process.env.PERFORMANCE_TEST_DATABASE_URL
const database = url ? describe : describe.skip

database('Forum paging (PostgreSQL)', () => {
  it('orders all roots, bounds hydration, freezes new replies, and invalidates deletion reorderings', async () => {
    const pool = new Pool({ connectionString: url })
    const db = new PrismaClient({ adapter: new PrismaPg(pool) })
    const rollback = new Error('rollback fixture')
    try {
      await expect(
        db.$transaction(
          async (tx) => {
            const user = await tx.user.create({
              data: { username: `p17-${randomUUID()}`, email: `${randomUUID()}@invalid.test`, passwordHash: 'fixture' }
            })
            const server = await tx.server.create({ data: { name: 'Forum fixture', ownerId: user.id } })
            const channel = await tx.channel.create({ data: { serverId: server.id, name: 'forum', type: 'forum' } })
            await tx.serverMember.create({ data: { serverId: server.id, userId: user.id } })
            const roots = Array.from({ length: 202 }, (_, i) => ({
              id: randomUUID(),
              channelId: channel.id,
              authorId: user.id,
              title: `Post ${i}`,
              content: 'body',
              createdAt: new Date(Date.UTC(2026, 9, 1) + Math.floor(i / 4) * 1000)
            }))
            await tx.message.createMany({ data: roots })
            const reply = await tx.message.create({
              data: {
                channelId: channel.id,
                authorId: user.id,
                threadParentId: roots[0]!.id,
                content: 'old active post',
                createdAt: new Date('2026-10-20T00:00:00Z')
              }
            })
            let hydrated = 0
            const delegate = new Proxy(tx.message, {
              get(target, key) {
                if (key === 'findMany')
                  return async (args: Parameters<typeof tx.message.findMany>[0]) => {
                    const rows = await tx.message.findMany(args)
                    expect(rows.length).toBeLessThanOrEqual(25)
                    hydrated += rows.length
                    return rows
                  }
                return Reflect.get(target, key)
              }
            })
            const prisma = new Proxy(tx, {
              get(target, key) {
                return key === 'message' ? delegate : Reflect.get(target, key)
              }
            }) as unknown as PrismaService
            const events = new EventBusService()
            const service = new ForumPostsService(prisma, new RolesService(prisma, events), events)
            const first = await service.listPosts(channel.id, user.id)
            expect(first.posts[0]!.id).toBe(roots[0]!.id)
            expect(hydrated).toBe(25)
            expect(first.nextCursor).toBeTruthy()
            await new Promise((resolve) => setTimeout(resolve, 5))
            await tx.message.create({
              data: {
                channelId: channel.id,
                authorId: user.id,
                threadParentId: roots[1]!.id,
                content: 'arrived during paging'
              }
            })
            const seen = first.posts.map((p) => p.id)
            let cursor = first.nextCursor
            while (cursor) {
              const next = await service.listPosts(channel.id, user.id, 'latest_activity', undefined, cursor)
              seen.push(...next.posts.map((p) => p.id))
              cursor = next.nextCursor
            }
            expect(seen).toHaveLength(202)
            expect(new Set(seen).size).toBe(202)
            expect(hydrated).toBe(202)
            const fresh = await service.listPosts(channel.id, user.id)
            expect(fresh.posts[0]!.id).toBe(roots[1]!.id)
            await tx.message.update({ where: { id: reply.id }, data: { deleted: true, content: null } })
            await expect(
              service.listPosts(channel.id, user.id, 'latest_activity', undefined, fresh.nextCursor!)
            ).rejects.toThrow(ConflictException)
            expect((await service.listPosts(channel.id, user.id)).posts.map((p) => p.id)).not.toContain(roots[0]!.id)
            const tag = await tx.forumTag.create({ data: { channelId: channel.id, name: 'Tagged', color: '#123456' } })
            await tx.forumPostTag.createMany({
              data: roots.slice(0, 3).map((p) => ({ messageId: p.id, tagId: tag.id }))
            })
            expect((await service.listPosts(channel.id, user.id, 'latest_activity', tag.id)).posts).toHaveLength(3)
            await expect(
              service.listPosts(channel.id, user.id, 'newest', undefined, first.nextCursor!)
            ).rejects.toThrow('Invalid forum cursor')
            const newestIds: string[] = []
            let newestCursor: string | undefined
            do {
              const page = await service.listPosts(channel.id, user.id, 'newest', undefined, newestCursor, 17)
              newestIds.push(...page.posts.map((p) => p.id))
              newestCursor = page.nextCursor ?? undefined
            } while (newestCursor)
            expect(newestIds).toHaveLength(202)
            expect(new Set(newestIds).size).toBe(202)
            const legacy = await service.listPosts(channel.id, user.id, 'newest', undefined, newestIds[16], 17)
            expect(legacy.posts.map((p) => p.id)).toEqual(newestIds.slice(17, 34))
            throw rollback
          },
          { timeout: 30_000 }
        )
      ).rejects.toBe(rollback)
    } finally {
      await db.$disconnect()
      await pool.end()
    }
  })
})
