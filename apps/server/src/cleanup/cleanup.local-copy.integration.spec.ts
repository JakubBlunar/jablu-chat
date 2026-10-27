import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolve, sep } from 'node:path'
import { PrismaClient } from '../prisma-client'
import { CleanupService } from './cleanup.service'
import { UploadsService } from '../uploads/uploads.service'

const url = process.env.CLEANUP_SNAPSHOT_DATABASE_URL
const database = url ? describe : describe.skip

database('Disposable copy of local Jablu data', () => {
  it('cleans reviewed candidates and removed data while preserving every live message', async () => {
    const parsed = new URL(url!)
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/cleanup_test_snapshot')
      throw new Error('A disposable local snapshot database is required')
    const dir = resolve(process.env.CLEANUP_SNAPSHOT_UPLOAD_DIR ?? '')
    const allowed = resolve(__dirname, '../../../..', '.tmp-tests/cleanup-local-copy-20261027')
    if (!dir.startsWith(allowed + sep)) throw new Error('Only the disposable local upload copy may be cleaned')
    const pool = new Pool({ connectionString: url }),
      db = new PrismaClient({ adapter: new PrismaPg(pool) })
    try {
      const uploads = new UploadsService(new ConfigService({ UPLOAD_DIR: dir }))
      const cleanup = new CleanupService(
        db as never,
        uploads,
        new ConfigService({
          DATABASE_URL: url,
          STORAGE_LIMIT_GB: 1 / 1024 ** 3,
          CLEANUP_MIN_AGE_DAYS: 1,
          CLEANUP_ORPHAN_HOURS: 24,
          CLEANUP_DELETE_MESSAGES: 'false',
          CLEANUP_SKIP_ARCHIVED: 'true'
        }),
        {} as SchedulerRegistry
      )
      const before = await cleanup.getStorageStats()
      const live = await db.message.findMany({ where: { deleted: false }, select: { id: true } })
      const originalMessages = before.messageCount
      const audit = await cleanup.runAudit()
      expect((await cleanup.getStorageStats()).messageCount).toBe(originalMessages)
      const pressure = await cleanup.executeCleanup(audit.id)
      expect((await cleanup.getStorageStats()).messageCount).toBe(originalMessages)
      expect(pressure.status).toBe('partial')
      const removed = await cleanup.runAudit('deleted')
      const purge = await cleanup.executeCleanup(removed.id)
      expect(await db.message.count({ where: { id: { in: live.map((m) => m.id) } } })).toBe(live.length)
      const after = await cleanup.getStorageStats()
      expect(after.dirSize.total).toBeLessThanOrEqual(before.dirSize.total)
      console.log(
        JSON.stringify({
          localCopy: {
            beforeMessages: before.messageCount,
            beforeAttachments: before.attachmentCount,
            beforeUploadBytes: before.dirSize.total,
            protectedLiveMessages: live.length,
            pressureFreedBytes: String(pressure.freedBytes),
            removedFreedBytes: String(purge.freedBytes),
            afterMessages: after.messageCount,
            afterAttachments: after.attachmentCount,
            afterUploadBytes: after.dirSize.total
          }
        })
      )
    } finally {
      await db.$disconnect()
      await pool.end()
    }
  }, 60_000)
})
