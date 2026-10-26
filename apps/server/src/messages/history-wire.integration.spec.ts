import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../prisma-client'
import { historyInclude, mapHistory } from './history-wire'
import { mapMessageToWire, messageInclude } from './message-wire'

const url = process.env.PERFORMANCE_TEST_DATABASE_URL
const database = url ? describe : describe.skip

database('Compact history (PostgreSQL)', () => {
  it('bounds reactor and voter hydration while preserving counts, own state and deleted-thread semantics', async () => {
    const pool = new Pool({ connectionString: url })
    const db = new PrismaClient({ adapter: new PrismaPg(pool) })
    const rollback = new Error('rollback fixture')
    try {
      await expect(db.$transaction(async tx => {
        const owner = await tx.user.create({ data: { username: `perf-${Date.now()}`, email: `perf-${Date.now()}@invalid.test`, passwordHash: 'fixture' } })
        const server = await tx.server.create({ data: { name: 'Performance fixture', ownerId: owner.id } })
        const channel = await tx.channel.create({ data: { name: 'fixture', type: 'text', serverId: server.id } })
        const root = await tx.message.create({ data: { channelId: channel.id, authorId: owner.id, content: 'Poll and reactions' } })
        await tx.message.createMany({ data: [
          { channelId: channel.id, authorId: owner.id, threadParentId: root.id, content: 'visible reply' },
          { channelId: channel.id, authorId: owner.id, threadParentId: root.id, content: 'deleted reply', deleted: true }
        ] })
        const poll = await tx.poll.create({ data: { messageId: root.id, question: 'Fixture?', options: { create: [{ label: 'Yes', position: 0 }] } }, include: { options: true } })
        // One user can react/vote once; generate independent users inside the rolled-back transaction.
        const users = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO users (id, username, email, password_hash, updated_at)
          SELECT gen_random_uuid()::text, 'perf-' || gen_random_uuid()::text, gen_random_uuid()::text || '@invalid.test', 'fixture', NOW()
          FROM generate_series(1, 1000) RETURNING id
        `
        const ids = [...users.map(u => u.id), owner.id]
        await tx.reaction.createMany({ data: ids.map(userId => ({ messageId: root.id, userId, emoji: '👍' })) })
        await tx.pollVote.createMany({ data: ids.map(userId => ({ optionId: poll.options[0].id, userId })) })
        const compact = await tx.message.findMany({ where: { id: root.id }, include: historyInclude(owner.id) })
        expect(compact[0].poll?.options[0].votes).toHaveLength(1)
        const wire = (await mapHistory(tx, compact, owner.id))[0]
        expect(wire.reactions[0]).toMatchObject({ count: 1001, usersComplete: false })
        expect(wire.reactions[0].userIds).toContain(owner.id)
        expect(wire.reactions[0].userIds.length).toBeLessThanOrEqual(4)
        expect(wire.poll?.options[0]).toMatchObject({ voteCount: 1001, voted: true })
        expect(wire.threadCount).toBe(1)
        expect(wire.lastThreadReply?.content).toBe('visible reply')
        const legacy = await tx.message.findUniqueOrThrow({ where: { id: root.id }, include: messageInclude })
        expect(mapMessageToWire(legacy, owner.id).threadCount).toBe(1)
        expect(JSON.stringify(mapMessageToWire(legacy, owner.id)).length).toBeGreaterThan(JSON.stringify(wire).length * 10)
        throw rollback
      }, { timeout: 30000 })).rejects.toBe(rollback)
    } finally { await db.$disconnect(); await pool.end() }
  }, 40000)
})
