import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { PrismaPg } from '@prisma/adapter-pg'
import { Client, Pool } from 'pg'
import { mkdtemp, writeFile, access, rm, mkdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { PrismaClient, Prisma } from '../prisma-client'
import { CleanupService } from './cleanup.service'
import { UploadsService } from '../uploads/uploads.service'
import * as fileOps from './cleanup-files'
import { Test } from '@nestjs/testing'
import { AdminController } from '../admin/admin.controller'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { AdminTokenStore } from '../admin/admin-token-store'
import { AdminRateLimiter } from '../admin/admin-rate-limiter'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { MailService } from '../auth/mail.service'
import { RedisService } from '../redis/redis.service'
import { EventBusService } from '../events/event-bus.service'
import { RolesService } from '../roles/roles.service'

jest.mock('./cleanup-files', () => {
  const actual = jest.requireActual('./cleanup-files')
  return { ...actual, deletePlannedFile: jest.fn(actual.deletePlannedFile) }
})

const url = process.env.CLEANUP_TEST_DATABASE_URL
const database = url ? describe : describe.skip
const now = Date.parse('2026-10-27T12:00:00Z'),
  day = 86400_000
const old = new Date(now - 100 * day),
  recent = new Date(now - day)

database('Storage cleanup safety contracts (isolated PostgreSQL + real files)', () => {
  let pool: Pool, db: PrismaClient, dir: string, author: string, channel: string, archived: string, forum: string
  let service: CleanupService, sequence: number
  const build = (values: Record<string, unknown> = {}) =>
    new CleanupService(
      db as never,
      new UploadsService(new ConfigService({ UPLOAD_DIR: dir })),
      new ConfigService({
        DATABASE_URL: url,
        STORAGE_LIMIT_GB: 1000 / 1024 ** 3,
        CLEANUP_MIN_AGE_DAYS: 30,
        CLEANUP_ORPHAN_HOURS: 24,
        CLEANUP_DELETE_MESSAGES: 'false',
        CLEANUP_SKIP_ARCHIVED: 'true',
        ...values
      }),
      {} as SchedulerRegistry
    )
  const message = (data: Partial<Prisma.MessageUncheckedCreateInput> = {}) =>
    db.message.create({ data: { channelId: channel, authorId: author, content: 'fixture', createdAt: old, ...data } })
  async function file(name: string, bytes = 20, sub = 'attachments', modified = old) {
    await mkdir(join(dir, sub), { recursive: true })
    const path = join(dir, sub, name)
    await writeFile(path, Buffer.alloc(bytes, 1))
    await utimes(path, modified, modified)
    return `/api/uploads/${sub}/${name}`
  }
  async function attachment(messageId: string | null, data: Partial<Prisma.AttachmentUncheckedCreateInput> = {}) {
    const name = `fixture-${++sequence}.bin`
    return db.attachment.create({
      data: {
        messageId,
        filename: name,
        url: await file(name),
        type: 'file',
        mimeType: 'application/octet-stream',
        sizeBytes: 20,
        createdAt: old,
        ...data
      }
    })
  }
  async function exists(url: string) {
    try {
      await access(join(dir, url.replace('/api/uploads/', '')))
      return true
    } catch {
      return false
    }
  }
  beforeAll(async () => {
    const parsed = new URL(url!)
    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      !/^\/cleanup_test(?:_[a-z0-9_]+)?$/.test(parsed.pathname)
    )
      throw new Error('Only a disposable local cleanup_test database is allowed')
    pool = new Pool({ connectionString: url })
    db = new PrismaClient({ adapter: new PrismaPg(pool) })
    await db.$connect()
  })
  afterAll(async () => {
    await db?.$disconnect()
    await pool?.end()
  })
  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now)
    jest.mocked(fileOps.deletePlannedFile).mockImplementation(jest.requireActual('./cleanup-files').deletePlannedFile)
    // This suite intentionally commits deletion ownership to verify recovery. The
    // strict URL gate above must run before any fixture reset can execute.
    await db.storageAudit.deleteMany()
    await db.attachment.deleteMany()
    await db.server.deleteMany()
    await db.directConversation.deleteMany()
    await db.user.deleteMany()
    dir = await mkdtemp(join(tmpdir(), 'chat-cleanup-contract-'))
    sequence = 0
    service = build()
    const user = await db.user.create({
      data: {
        username: `cleanup_${crypto.randomUUID()}`,
        email: `${crypto.randomUUID()}@invalid.test`,
        passwordHash: 'fixture'
      }
    })
    author = user.id
    const server = await db.server.create({ data: { name: 'Cleanup fixture', ownerId: author } })
    channel = (await db.channel.create({ data: { serverId: server.id, name: 'general' } })).id
    archived = (await db.channel.create({ data: { serverId: server.id, name: 'archive', isArchived: true } })).id
    forum = (await db.channel.create({ data: { serverId: server.id, name: 'forum', type: 'forum' } })).id
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    if (!resolve(dir).startsWith(resolve(tmpdir()) + sep) || !dir.includes('chat-cleanup-contract-'))
      throw new Error('Unsafe fixture path')
    await rm(dir, { recursive: true, force: true })
  })
  it('creates a bounded durable plan without deleting source rows or files', async () => {
    const att = await attachment((await message()).id)
    const audit = await service.runAudit()
    expect(audit).toMatchObject({
      status: 'completed',
      planVersion: 1,
      totalFreeable: 20n,
      affectedMessages: 0,
      affectedAttachments: 1
    })
    expect(await db.storageCleanupItem.count({ where: { auditId: audit.id } })).toBe(1)
    expect(await db.attachment.count()).toBe(1)
    expect(await exists(att.url)).toBe(true)
  })
  it('awaits original and thumbnail deletion and counts actual bytes', async () => {
    const thumbnailUrl = await file('thumb.webp', 10, 'thumbnails')
    const att = await attachment(null, { thumbnailUrl, sizeBytes: 9999 })
    const audit = await service.runAudit()
    expect(audit.totalFreeable).toBe(30n)
    const result = await service.executeCleanup(audit.id)
    expect(result.freedBytes).toBe(30n)
    expect(await exists(att.url)).toBe(false)
    expect(await exists(thumbnailUrl)).toBe(false)
    expect(await db.attachment.count()).toBe(0)
  })
  it('does not delete fresh or exact-boundary DB orphans', async () => {
    await attachment(null, { createdAt: new Date(now - day) })
    await attachment(null, { createdAt: recent })
    expect((await service.runAudit()).orphanedCount).toBe(0)
  })
  it('rechecks an orphan that was attached after review', async () => {
    const att = await attachment(null),
      audit = await service.runAudit()
    await db.attachment.update({ where: { id: att.id }, data: { messageId: (await message()).id } })
    await service.executeCleanup(audit.id)
    expect(await db.attachment.count()).toBe(1)
    expect(await exists(att.url)).toBe(true)
    expect((await db.storageCleanupItem.findFirstOrThrow()).status).toBe('skipped')
  })
  it.each(['pin', 'archive', 'edit'])('revalidates message protection after review: %s', async (action) => {
    const msg = await message(),
      att = await attachment(msg.id),
      audit = await service.runAudit()
    if (action === 'pin') await db.message.update({ where: { id: msg.id }, data: { pinned: true } })
    if (action === 'archive') await db.channel.update({ where: { id: channel }, data: { isArchived: true } })
    if (action === 'edit')
      await db.message.update({ where: { id: msg.id }, data: { editedAt: recent, content: 'updated' } })
    await service.executeCleanup(audit.id)
    expect(await db.attachment.count()).toBe(1)
    expect(await exists(att.url)).toBe(true)
  })
  it('preserves a forum root, poll and recent replies during attachment-only cleanup', async () => {
    const root = await message({ channelId: forum, title: 'Post', content: '' })
    const att = await attachment(root.id)
    await db.poll.create({ data: { messageId: root.id, question: 'Question' } })
    const reply = await message({ channelId: forum, threadParentId: root.id, createdAt: recent })
    const audit = await service.runAudit()
    expect(audit.totalFreeable).toBe(0n)
    await service.executeCleanup(audit.id)
    expect(await db.message.count()).toBe(2)
    expect(await db.poll.count()).toBe(1)
    expect((await db.message.findUniqueOrThrow({ where: { id: reply.id } })).threadParentId).toBe(root.id)
    expect(await exists(att.url)).toBe(true)
  })
  it('keeps attachment-only messages even when all attachments are removed', async () => {
    const msg = await message({ content: '' })
    await attachment(msg.id)
    await attachment(msg.id)
    await service.executeCleanup((await service.runAudit()).id)
    expect(await db.message.count()).toBe(1)
    expect(await db.attachment.count()).toBe(0)
  })
  it('allows old DM attachments without disabling archived-channel protection', async () => {
    const conversation = await db.directConversation.create({ data: {} })
    const direct = await attachment((await message({ channelId: null, directConversationId: conversation.id })).id)
    const kept = await attachment((await message({ channelId: archived })).id)
    await service.executeCleanup((await service.runAudit()).id)
    expect(await db.attachment.findUnique({ where: { id: direct.id } })).toBeNull()
    expect(await db.attachment.findUnique({ where: { id: kept.id } })).not.toBeNull()
  })
  it('never deletes recent replies through an old root', async () => {
    const root = await message({ channelId: forum, title: 'Active' })
    await attachment(root.id)
    const reply = await message({ channelId: forum, threadParentId: root.id, createdAt: recent })
    const att = await attachment(reply.id, { createdAt: recent })
    const enabled = build({ CLEANUP_DELETE_MESSAGES: 'true' }),
      audit = await enabled.runAudit()
    expect(audit.forumPostCount).toBe(0)
    await enabled.executeCleanup(audit.id)
    expect(await db.message.count()).toBe(2)
    expect(await exists(att.url)).toBe(true)
  })
  it('removes an entirely old eligible thread once, with deduplicated bytes and full affected counts', async () => {
    const root = await message({ channelId: forum, title: 'Old' }),
      reply = await message({ channelId: forum, threadParentId: root.id })
    await attachment(root.id)
    await attachment(reply.id)
    const enabled = build({ CLEANUP_DELETE_MESSAGES: 'true' }),
      audit = await enabled.runAudit()
    expect(audit).toMatchObject({
      forumPostCount: 1,
      attachmentCount: 0,
      totalFreeable: 40n,
      affectedMessages: 2,
      affectedAttachments: 2
    })
    await enabled.executeCleanup(audit.id)
    expect(await db.message.count()).toBe(0)
  })
  it('protects pinned messages and their thread files by default', async () => {
    const root = await message({ pinned: true })
    await attachment(root.id)
    const reply = await message({ threadParentId: root.id })
    await attachment(reply.id)
    const enabled = build({ CLEANUP_DELETE_MESSAGES: 'true' })
    expect((await enabled.runAudit()).totalFreeable).toBe(0n)
  })
  it('protects shared file references and does not overstate their freeable bytes', async () => {
    const att = await attachment((await message()).id),
      keeper = await message({ createdAt: recent })
    await db.linkPreview.create({ data: { messageId: keeper.id, url: 'https://invalid.test', imageUrl: att.url } })
    const audit = await service.runAudit()
    expect(audit.totalFreeable).toBe(0n)
    await service.executeCleanup(audit.id)
    expect(await exists(att.url)).toBe(true)
  })
  it('applies disk orphan grace and preserves referenced images, group avatars and game icons', async () => {
    const fresh = await file('in-flight', 20, 'attachments', recent)
    const unowned = await file('abandoned', 20)
    const avatar = await file('snapshot.webp', 20, 'avatars')
    await message({ createdAt: recent, webhookAvatarUrl: avatar })
    const image = await file('preview.webp', 20),
      msg = await message({ createdAt: recent })
    await db.linkPreview.create({ data: { messageId: msg.id, url: 'https://invalid.test', imageUrl: image } })
    const groupAvatarUrl = await file('group.webp', 20, 'avatars')
    await db.directConversation.create({ data: { groupAvatarUrl } })
    const iconUrl = await file('game.webp', 20, 'activity-icons')
    await db.registeredGame.create({ data: { userId: author, name: 'Fixture game', iconUrl } })
    const audit = await service.runAudit()
    expect(audit.diskOrphanCount).toBe(1)
    await service.executeCleanup(audit.id)
    expect(await exists(unowned)).toBe(false)
    for (const url of [fresh, avatar, image, groupAvatarUrl, iconUrl]) expect(await exists(url)).toBe(true)
  })
  it('collects abandoned activity icons', async () => {
    const icon = await file('unused.webp', 20, 'activity-icons')
    await service.executeCleanup((await service.runAudit()).id)
    expect(await exists(icon)).toBe(false)
  })
  it('skips changed files before removing their DB owner', async () => {
    const att = await attachment(null),
      audit = await service.runAudit()
    await writeFile(join(dir, 'attachments', att.filename), 'changed after review')
    await service.executeCleanup(audit.id)
    expect(await db.attachment.count()).toBe(1)
    expect(await exists(att.url)).toBe(true)
  })
  it('treats a missing old file idempotently without claiming freed bytes', async () => {
    const att = await attachment(null),
      audit = await service.runAudit()
    await rm(join(dir, 'attachments', att.filename))
    const result = await service.executeCleanup(audit.id)
    expect(result.freedBytes).toBe(0n)
    expect(await db.attachment.count()).toBe(0)
  })
  it('preserves durable retry ownership after unlink failure and recovers with a new service', async () => {
    const att = await attachment(null),
      audit = await service.runAudit()
    const fault = jest
      .mocked(fileOps.deletePlannedFile)
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
    await expect(service.executeCleanup(audit.id)).rejects.toThrow('permission denied')
    expect(await db.attachment.count()).toBe(0)
    expect(await exists(att.url)).toBe(true)
    expect((await db.storageCleanupItem.findFirstOrThrow()).status).toBe('deleting')
    await expect(service.deleteAudit(audit.id)).rejects.toThrow('recovery')
    fault.mockImplementation(jest.requireActual('./cleanup-files').deletePlannedFile)
    expect((await build().executeCleanup(audit.id)).freedBytes).toBe(20n)
    expect(await exists(att.url)).toBe(false)
  })
  it('expired recovery finishes claimed file work without starting other planned deletions', async () => {
    const a = await attachment(null),
      b = await attachment(null),
      audit = await service.runAudit()
    const fault = jest.mocked(fileOps.deletePlannedFile).mockRejectedValueOnce(new Error('temporary I/O failure'))
    await expect(service.executeCleanup(audit.id)).rejects.toThrow()
    fault.mockImplementation(jest.requireActual('./cleanup-files').deletePlannedFile)
    jest.spyOn(Date, 'now').mockReturnValue(now + 2 * day)
    await build().executeCleanup(audit.id)
    expect([await exists(a.url), await exists(b.url)].filter(Boolean)).toHaveLength(1)
    expect(await db.attachment.count()).toBe(1)
  })
  it('excludes pending deletion files from later orphan plans', async () => {
    await attachment(null)
    const audit = await service.runAudit()
    const fault = jest.mocked(fileOps.deletePlannedFile).mockRejectedValueOnce(new Error('I/O'))
    await expect(service.executeCleanup(audit.id)).rejects.toThrow()
    fault.mockImplementation(jest.requireActual('./cleanup-files').deletePlannedFile)
    expect((await service.runAudit()).diskOrphanCount).toBe(0)
  })
  it('rejects parallel workers and audit dismissal using the actual PostgreSQL session lock', async () => {
    await attachment(null)
    const audit = await service.runAudit()
    const lock = new Client({ connectionString: url })
    await lock.connect()
    try {
      await lock.query('SELECT pg_advisory_lock(867239, 1)')
      await expect(build().executeCleanup(audit.id)).rejects.toThrow('Another cleanup')
      await expect(build().deleteAudit(audit.id)).rejects.toThrow('Another cleanup')
      expect(await db.attachment.count()).toBe(1)
    } finally {
      await lock.end()
    }
  })
  it('allows only one concurrent execution of the same plan', async () => {
    await attachment(null)
    const audit = await service.runAudit()
    const results = await Promise.allSettled([service.executeCleanup(audit.id), build().executeCleanup(audit.id)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.attachment.count()).toBe(0)
  })
  it('never adds newly eligible candidates to an old reviewed plan', async () => {
    const att = await attachment(null, { createdAt: new Date(now - 23 * 3600_000) }),
      audit = await service.runAudit()
    expect(audit.totalFreeable).toBe(0n)
    jest.spyOn(Date, 'now').mockReturnValue(now + 2 * 3600_000)
    await service.executeCleanup(audit.id)
    expect(await exists(att.url)).toBe(true)
  })
  it('rejects an expired plan before any source mutation', async () => {
    const att = await attachment(null),
      audit = await service.runAudit()
    jest.spyOn(Date, 'now').mockReturnValue(now + 2 * day)
    await expect(service.executeCleanup(audit.id)).rejects.toThrow('expired')
    expect(await exists(att.url)).toBe(true)
    expect(await db.attachment.count()).toBe(1)
  })
  it('stops between individual attachment items once the target is met', async () => {
    for (let i = 0; i < 8; i++) await attachment((await message()).id)
    const small = build({ STORAGE_LIMIT_GB: 100 / 1024 ** 3 })
    const measure = small.getStorageStats.bind(small)
    jest.spyOn(small, 'getStorageStats').mockImplementation(async () => {
      const stats = await measure()
      return { ...stats, totalBytes: stats.dirSize.total }
    })
    const result = await small.executeCleanup((await small.runAudit()).id)
    expect(await db.attachment.count()).toBe(4)
    expect(result).toMatchObject({
      status: 'executed',
      stopReason: 'target_reached',
      freedBytes: 80n,
      afterSizeBytes: 80n
    })
  })
  it('does not erase text-only history to chase an unattainable byte target', async () => {
    await file('protected.webp', 200, 'avatars')
    const server = await db.server.findFirstOrThrow()
    await db.server.update({ where: { id: server.id }, data: { iconUrl: '/api/uploads/avatars/protected.webp' } })
    await db.message.createMany({
      data: Array.from({ length: 205 }, () => ({
        channelId: channel,
        authorId: author,
        content: 'old text',
        createdAt: old
      }))
    })
    const enabled = build({ CLEANUP_DELETE_MESSAGES: 'true' }),
      audit = await enabled.runAudit()
    expect(audit.messageCount).toBe(0)
    expect((await enabled.executeCleanup(audit.id)).status).toBe('partial')
    expect(await db.message.count()).toBe(205)
  })
  it('bounds the plan and clearly reports the need for another reviewed audit', async () => {
    for (let i = 0; i < 4; i++) await attachment(null)
    const bounded = build({ CLEANUP_MAX_ITEMS: 2 }),
      audit = await bounded.runAudit()
    expect(audit.planLimited).toBe(true)
    expect(await db.storageCleanupItem.count()).toBe(2)
    expect((await bounded.executeCleanup(audit.id)).stopReason).toBe('plan_limit_create_new_audit')
    expect(await db.attachment.count()).toBe(2)
  })
  it('purges only reviewed removed messages, including local previews, while preserving live messages', async () => {
    const removed = await message({ deleted: true, deletedAt: recent }),
      live = await message()
    const imageUrl = await file('preview.webp', 10)
    await db.linkPreview.create({ data: { messageId: removed.id, url: 'https://invalid.test', imageUrl } })
    const audit = await service.runAudit('deleted')
    await message({ deleted: true, deletedAt: recent })
    await service.executeCleanup(audit.id)
    expect(await db.message.findUnique({ where: { id: removed.id } })).toBeNull()
    expect(await db.message.findUnique({ where: { id: live.id } })).not.toBeNull()
    expect(await db.message.count()).toBe(2)
    expect(await exists(imageUrl)).toBe(false)
  })
  it('preserves live replies beneath a removed root', async () => {
    const root = await message({ deleted: true, deletedAt: recent }),
      reply = await message({ threadParentId: root.id })
    await service.executeCleanup((await service.runAudit('deleted')).id)
    expect((await db.message.findUniqueOrThrow({ where: { id: reply.id } })).threadParentId).toBe(root.id)
  })
  it('accounts for the current database and only explicitly configured extra storage', async () => {
    await file('upload', 20)
    const extra = join(dir, '..', `${dir.split(sep).pop()}-extra`)
    await mkdir(extra)
    await writeFile(join(extra, 'sentinel'), Buffer.alloc(30))
    try {
      const stats = await build({ STORAGE_EXTRA_DIRS: extra }).getStorageStats()
      expect(stats.databaseBytes).toBeGreaterThan(0)
      expect(stats.totalBytes).toBe(stats.databaseBytes + 50)
      expect(stats.scope).toContain('excluded')
    } finally {
      await rm(extra, { recursive: true, force: true })
    }
  })
  it('cleans reviewed old log rows and closed archives, preserving current and fresh logs', async () => {
    const logDir = join(dir, '..', `${dir.split(sep).pop()}-logs`)
    await mkdir(logDir)
    try {
      for (const name of ['api.log', 'api.log.1', 'fresh.gz']) {
        const path = join(logDir, name)
        await writeFile(path, 'log')
        await utimes(path, name === 'fresh.gz' ? recent : old, name === 'fresh.gz' ? recent : old)
      }
      const server = await db.server.findFirstOrThrow()
      await db.auditLog.createMany({
        data: [old, recent].map((createdAt) => ({ actorId: author, serverId: server.id, action: 'fixture', createdAt }))
      })
      const logs = build({ CLEANUP_LOG_ARCHIVE_DIR: logDir }),
        audit = await logs.runAudit('logs')
      await logs.executeCleanup(audit.id)
      expect(await db.auditLog.count()).toBe(1)
      await expect(access(join(logDir, 'api.log.1'))).rejects.toThrow()
      await access(join(logDir, 'api.log'))
      await access(join(logDir, 'fresh.gz'))
    } finally {
      await rm(logDir, { recursive: true, force: true })
    }
  })
  it('supersedes old completed reports after a cleanup', async () => {
    await attachment(null)
    const previous = await service.runAudit(),
      latest = await service.runAudit()
    await service.executeCleanup(latest.id)
    expect((await db.storageAudit.findUniqueOrThrow({ where: { id: previous.id } })).status).toBe('superseded')
    await expect(service.executeCleanup(previous.id)).rejects.toThrow('not executable')
  })
  it('rejects aggregate-only legacy reports', async () => {
    const audit = await service.runAudit()
    await db.storageAudit.update({ where: { id: audit.id }, data: { planVersion: 0 } })
    await expect(service.executeCleanup(audit.id)).rejects.toThrow('new audit')
  })
  it('invalidates pending work when the configured retention policy changes', async () => {
    const att = await attachment(null),
      audit = await service.runAudit()
    await expect(build({ CLEANUP_ORPHAN_HOURS: 48 }).executeCleanup(audit.id)).rejects.toThrow('policy changed')
    expect(await exists(att.url)).toBe(true)
  })
  it('marks an abandoned executing audit interrupted when its owner no longer holds the lock', async () => {
    const audit = await service.runAudit()
    await db.storageAudit.update({ where: { id: audit.id }, data: { status: 'executing' } })
    expect((await service.getAudits()).find((a) => a.id === audit.id)?.status).toBe('interrupted')
  })
  it('persists a failed finalization and permits idempotent recovery', async () => {
    await attachment(null)
    const audit = await service.runAudit()
    const original = db.storageAudit.update.bind(db.storageAudit)
    let fail = true
    const fault = jest.spyOn(db.storageAudit, 'update').mockImplementation((async (args: any) => {
      if (fail && args.data.status === 'partial') {
        fail = false
        throw new Error('final update failed')
      }
      return original(args)
    }) as any)
    await expect(service.executeCleanup(audit.id)).rejects.toThrow('final update failed')
    expect((await db.storageAudit.findUniqueOrThrow({ where: { id: audit.id } })).status).toBe('failed')
    fault.mockRestore()
    expect((await service.executeCleanup(audit.id)).freedBytes).toBe(20n)
    expect(await db.attachment.count()).toBe(0)
  })
  it('starts a background worker promptly and exposes durable completion', async () => {
    await attachment(null)
    const audit = await service.runAudit()
    const started = await service.startCleanup(audit.id)
    expect(started.status).toBe('executing')
    let result = started
    for (let attempt = 0; attempt < 100 && result.status === 'executing'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      result = await db.storageAudit.findUniqueOrThrow({ where: { id: audit.id } })
    }
    expect(result.status).toBe('partial')
    expect(result.freedBytes).toBe(20n)
  })
  it('pages the exact reviewed candidates without exposing BigInts to JSON serialization', async () => {
    await attachment(null)
    const audit = await service.runAudit()
    const page = await service.getAuditItems(audit.id)
    expect(page.items).toHaveLength(1)
    expect(page.next).toBeNull()
    expect(() => JSON.stringify(page)).not.toThrow()
    await expect(service.getAuditItems(audit.id, NaN)).rejects.toThrow('cursor')
  })
  it('protects absolute and percent-encoded references with query strings', async () => {
    const image = await file('a.bin'),
      msg = await message({ createdAt: recent })
    await db.linkPreview.create({
      data: {
        messageId: msg.id,
        url: 'https://invalid.test',
        imageUrl: 'https://jablu.invalid/api/uploads/attachments/%61.bin?cache=1'
      }
    })
    const audit = await service.runAudit()
    expect(audit.diskOrphanCount).toBe(0)
    await service.executeCleanup(audit.id)
    expect(await exists(image)).toBe(true)
  })
  it('uses the normalized ownership index on realistic attachment row counts', async () => {
    await db.attachment.createMany({
      data: Array.from({ length: 5000 }, (_, i) => ({
        filename: `index-${i}`,
        url: `/api/uploads/attachments/index-${i}`,
        type: 'file' as const,
        mimeType: 'text/plain',
        sizeBytes: 0
      }))
    })
    await db.$executeRawUnsafe('ANALYZE attachments')
    const plan = await db.$queryRawUnsafe(
      "EXPLAIN (FORMAT JSON) SELECT id FROM attachments WHERE cleanup_upload_url(url) = '/api/uploads/attachments/index-100'"
    )
    expect(JSON.stringify(plan)).toContain('attachments_cleanup_url_idx')
  })
  it('enforces guards and validation over HTTP and starts the durable worker with HTTP 202', async () => {
    await attachment(null)
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminAuthGuard,
        { provide: ConfigService, useValue: new ConfigService({}) },
        { provide: PrismaService, useValue: db },
        { provide: CleanupService, useValue: service },
        { provide: AdminTokenStore, useValue: { validate: (token: string) => token === 'cleanup-fixture' } },
        ...[
          UploadsService,
          NotificationsService,
          MailService,
          AdminRateLimiter,
          RedisService,
          EventBusService,
          RolesService
        ].map((provide) => ({ provide, useValue: {} }))
      ]
    }).compile()
    const app = module.createNestApplication()
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    try {
      const base = await app.getUrl()
      expect((await fetch(`${base}/api/admin/storage`)).status).toBe(401)
      const headers = { 'x-admin-token': 'cleanup-fixture' }
      expect((await fetch(`${base}/api/admin/storage/cleanup/invalid`, { method: 'POST', headers })).status).toBe(400)
      expect((await fetch(`${base}/api/admin/storage/audit?mode=invalid`, { method: 'POST', headers })).status).toBe(
        400
      )
      const response = await fetch(`${base}/api/admin/storage/audit`, { method: 'POST', headers })
      expect(response.status).toBe(201)
      const audit = await response.json()
      expect(audit.totalFreeable).toBe('20')
      const preview = await fetch(`${base}/api/admin/storage/audits/${audit.id}/items`, { headers })
      expect((await preview.json()).items).toHaveLength(1)
      const started = await fetch(`${base}/api/admin/storage/cleanup/${audit.id}`, { method: 'POST', headers })
      expect(started.status).toBe(202)
      expect((await started.json()).status).toBe('executing')
      let status = 'executing'
      for (let attempt = 0; attempt < 100 && status === 'executing'; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        const history = await fetch(`${base}/api/admin/storage/audits`, { headers })
        status = (await history.json()).find((row: { id: string }) => row.id === audit.id).status
      }
      expect(status).toBe('partial')
      expect(await db.attachment.count()).toBe(0)
    } finally {
      await app.close()
    }
  })
  it('lets a concurrent attachment connection win before cleanup can claim the locked row', async () => {
    const att = await attachment(null),
      target = await message({ createdAt: recent }),
      audit = await service.runAudit()
    let ready!: () => void, release!: () => void
    const locked = new Promise<void>((resolve) => {
      ready = resolve
    })
    const finish = new Promise<void>((resolve) => {
      release = resolve
    })
    const sending = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM attachments WHERE id = ${att.id} FOR UPDATE`
        ready()
        await finish
        await tx.attachment.update({ where: { id: att.id }, data: { messageId: target.id } })
      },
      { timeout: 30_000 }
    )
    await locked
    const cleaning = service.executeCleanup(audit.id)
    try {
      let waiting = false
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const rows = await db.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM attachments%') AS waiting`
        waiting = rows[0].waiting
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(waiting).toBe(true)
    } finally {
      release()
    }
    await sending
    await cleaning
    expect((await db.attachment.findUniqueOrThrow({ where: { id: att.id } })).messageId).toBe(target.id)
    expect(await exists(att.url)).toBe(true)
  })
})
