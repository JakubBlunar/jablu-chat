import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../prisma-client'
import type { PrismaService } from '../prisma/prisma.service'
import { DmService } from './dm.service'

const url = process.env.PERFORMANCE_TEST_DATABASE_URL
const database = url ? describe : describe.skip

database('DM list previews (PostgreSQL)', () => {
  it('returns the latest live preview for open memberships including attachment-only and empty conversations', async () => {
    const pool = new Pool({ connectionString: url })
    const db = new PrismaClient({ adapter: new PrismaPg(pool), log: [{ emit: 'event', level: 'query' }] })
    const queries: { query: string; params: string }[] = []
    db.$on('query', (event) => queries.push(event))
    const rollback = new Error('rollback fixture')
    try {
      await expect(
        db.$transaction(
          async (tx) => {
            const owner = await tx.user.create({
              data: {
                username: 'list-' + crypto.randomUUID(),
                email: crypto.randomUUID() + '@invalid.test',
                passwordHash: 'fixture'
              }
            })
            const conversation = (favorite = false, closed = false) =>
              tx.directConversation.create({
                data: {
                  members: { create: { userId: owner.id, isFavorite: favorite, closedAt: closed ? new Date() : null } }
                }
              })
            const busy = await conversation()
            const empty = await conversation(true)
            const closed = await conversation(false, true)
            const other = await tx.directConversation.create({ data: {} })
            await tx.$executeRaw`
          INSERT INTO messages (id, direct_conversation_id, content, created_at)
          SELECT gen_random_uuid()::text, ${busy.id}, 'old message', timestamp '2000-01-01' + n * interval '1 second'
          FROM generate_series(1, 5000) AS n
        `
            await tx.message.create({
              data: {
                directConversationId: busy.id,
                authorId: owner.id,
                createdAt: new Date('2020-01-01'),
                attachments: {
                  create: {
                    filename: 'sample.pdf',
                    url: '/sample',
                    type: 'file',
                    mimeType: 'application/pdf',
                    sizeBytes: 10
                  }
                }
              }
            })
            await tx.message.createMany({
              data: [busy.id, closed.id, other.id].map((id) => ({
                directConversationId: id,
                deleted: id === busy.id,
                content: 'excluded'
              }))
            })
            const service = new DmService(tx as unknown as PrismaService, null!, null!, null!)
            queries.length = 0
            const list = await service.getConversations(owner.id)
            const reads = queries.filter((entry) => /\bFROM\s+(?:"public"\.)?"?messages"?\s/i.test(entry.query))
            expect(reads).toHaveLength(1)
            const [previewQuery] = reads
            const [explain] = await tx.$queryRawUnsafe<{ 'QUERY PLAN': { Plan: { 'Actual Rows': number } }[] }[]>(
              'EXPLAIN (ANALYZE, FORMAT JSON) ' + previewQuery.query,
              ...JSON.parse(previewQuery.params)
            )
            expect(explain['QUERY PLAN'][0].Plan['Actual Rows']).toBe(1)
            expect(list.map((c) => c.id)).toEqual([empty.id, busy.id])
            expect(list[0].lastMessage).toBeNull()
            expect(list[1].lastMessage).toMatchObject({
              content: null,
              authorName: owner.username,
              attachment: { type: 'file', filename: 'sample.pdf' }
            })
            throw rollback
          },
          { timeout: 30000 }
        )
      ).rejects.toBe(rollback)
    } finally {
      await db.$disconnect()
      await pool.end()
    }
  }, 40000)
})
