import { Injectable, Logger, OnModuleInit, ConflictException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { Client } from 'pg'
import { resolve, relative, isAbsolute } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { Prisma, StorageCleanupItem } from '../prisma-client'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { PlannedFile, snapshotFile, walkFiles, deletePlannedFile, localUploadPath } from './cleanup-files'

type Tx = Prisma.TransactionClient
type Mode = 'pressure' | 'deleted' | 'logs'
type Policy = {
  root: string
  logRoot: string | null
  extraRoots: string[]
  age: string
  orphan: string
  deleted: string
  logs: string
  deleteMessages: boolean
  skipArchived: boolean
  protectPinned: boolean
  limit: number
  target: number
  retention: number[]
}
const messageInclude = {
  attachments: { orderBy: { id: 'asc' as const } },
  linkPreviews: { orderBy: { id: 'asc' as const } }
}
type Message = Prisma.MessageGetPayload<{ include: typeof messageInclude }>
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const equal = (a: unknown, b: unknown) => isDeepStrictEqual(json(a), json(b))
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, val]) => JSON.stringify(key) + ':' + canonical(val))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(canonical(json(value)))
    .digest('hex')
const day = 86400_000
const VERSION = 1
export interface StorageStats {
  dirSize: { avatars: number; attachments: number; thumbnails: number; other: number; total: number }
  limitBytes: number
  targetBytes: number
  attachmentCount: number
  messageCount: number
  orphanedAttachments: number
  databaseBytes: number
  extraBytes: number
  logBytes: number
  totalBytes: number
  scope: string
}

@Injectable()
export class CleanupService implements OnModuleInit {
  private readonly logger = new Logger(CleanupService.name)
  private readonly uploadDir: string
  private readonly logDir: string | null
  private readonly extraDirs: string[]
  private readonly limitBytes: number
  private readonly watermarkBytes: number
  private readonly minAgeDays: number
  private readonly orphanHours: number
  private readonly deletedDays: number
  private readonly logDays: number
  private readonly maxItems: number
  private readonly deleteMessages: boolean
  private readonly skipArchived: boolean
  private readonly protectPinned: boolean
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    this.uploadDir = resolve(uploads.getUploadDir())
    this.limitBytes = Math.floor(this.number('STORAGE_LIMIT_GB', 100, Number.MIN_VALUE) * 1024 ** 3)
    if (!Number.isSafeInteger(this.limitBytes) || this.limitBytes < 1)
      throw new Error('STORAGE_LIMIT_GB is outside the supported range')
    this.watermarkBytes = Math.floor((this.limitBytes * this.number('CLEANUP_TARGET_PERCENT', 90, 1, 100)) / 100)
    this.minAgeDays = this.number('CLEANUP_MIN_AGE_DAYS', 90, 1)
    this.orphanHours = this.number('CLEANUP_ORPHAN_HOURS', 24, 1)
    this.deletedDays = this.number('CLEANUP_DELETED_AGE_DAYS', 30, 1)
    this.logDays = this.number('CLEANUP_LOG_AGE_DAYS', 90, 1)
    this.maxItems = this.number('CLEANUP_MAX_ITEMS', 5000, 1, 50_000)
    if (!Number.isInteger(this.maxItems)) throw new Error('CLEANUP_MAX_ITEMS must be an integer')
    this.deleteMessages = this.boolean('CLEANUP_DELETE_MESSAGES', false)
    this.skipArchived = this.boolean('CLEANUP_SKIP_ARCHIVED', true)
    this.protectPinned = this.boolean('CLEANUP_PROTECT_PINNED', true)
    this.boolean('CLEANUP_ENABLED', false)
    this.logDir = config.get<string>('CLEANUP_LOG_ARCHIVE_DIR')
      ? resolve(config.get<string>('CLEANUP_LOG_ARCHIVE_DIR')!)
      : null
    this.extraDirs = config
      .get<string>('STORAGE_EXTRA_DIRS', '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => resolve(s))
    const roots = [this.uploadDir, ...(this.logDir ? [this.logDir] : []), ...this.extraDirs]
    for (let i = 0; i < roots.length; i++)
      for (let j = 0; j < i; j++) {
        const path = relative(roots[j], roots[i]),
          reverse = relative(roots[i], roots[j])
        if ((!path.startsWith('..') && !isAbsolute(path)) || (!reverse.startsWith('..') && !isAbsolute(reverse)))
          throw new Error('Storage roots must be distinct and must not overlap')
      }
  }
  private number(key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
    const raw = this.config.get<string | number>(key, fallback)
    const value = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw)
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key}`)
    return value
  }
  private boolean(key: string, fallback: boolean) {
    const value = this.config.get<string>(key, String(fallback))
    if (value !== 'true' && value !== 'false') throw new Error(`Invalid ${key}: expected true or false`)
    return value === 'true'
  }
  onModuleInit() {
    if (!this.boolean('CLEANUP_ENABLED', false)) return
    const job = new CronJob(this.config.get<string>('CLEANUP_CRON', '0 3 * * *'), () => {
      void this.runScheduledAudit()
    })
    this.schedulerRegistry.addCronJob('storage-audit', job)
    job.start()
  }
  private async runScheduledAudit() {
    try {
      await this.runAudit()
    } catch (error) {
      this.logger.error('Scheduled audit failed', error)
    }
  }
  async calculateDirSize(dir: string) {
    let bytes = 0
    for await (const file of walkFiles(dir)) bytes += file.size
    return bytes
  }
  async getStorageStats(): Promise<StorageStats> {
    const roots = await Promise.all(
      [this.uploadDir, ...this.extraDirs, ...(this.logDir ? [this.logDir] : [])].map((path) => realpath(path))
    )
    for (let i = 0; i < roots.length; i++)
      for (let j = 0; j < i; j++) {
        const path = relative(roots[j], roots[i]),
          reverse = relative(roots[i], roots[j])
        if ((!path.startsWith('..') && !isAbsolute(path)) || (!reverse.startsWith('..') && !isAbsolute(reverse)))
          throw new Error('Resolved storage roots overlap')
      }
    const dirSize = { avatars: 0, attachments: 0, thumbnails: 0, other: 0, total: 0 }
    for await (const file of walkFiles(this.uploadDir)) {
      const category = file.path.split('/')[0]
      dirSize[category === 'avatars' || category === 'attachments' || category === 'thumbnails' ? category : 'other'] +=
        file.size
      dirSize.total += file.size
    }
    const [counts, database, extraSizes, logBytes] = await Promise.all([
      Promise.all([
        this.prisma.attachment.count(),
        this.prisma.message.count(),
        this.prisma.attachment.count({ where: { messageId: null } })
      ]),
      this.prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
      Promise.all(this.extraDirs.map((dir) => this.calculateDirSize(dir))),
      this.logDir ? this.calculateDirSize(this.logDir) : 0
    ])
    const databaseBytes = Number(database[0].bytes),
      extraBytes = extraSizes.reduce((a, b) => a + b, 0)
    return {
      dirSize,
      databaseBytes,
      extraBytes,
      logBytes,
      totalBytes: dirSize.total + databaseBytes + extraBytes + logBytes,
      limitBytes: this.limitBytes,
      targetBytes: this.watermarkBytes,
      attachmentCount: counts[0],
      messageCount: counts[1],
      orphanedAttachments: counts[2],
      scope:
        'Uploads + current PostgreSQL database + configured extra/archive directories. Other VPS apps, PostgreSQL WAL, Redis and Docker-managed files/logs are excluded.'
    }
  }
  private async policy(): Promise<Policy> {
    const now = Date.now()
    return {
      root: await realpath(this.uploadDir),
      logRoot: this.logDir ? await realpath(this.logDir) : null,
      extraRoots: await Promise.all(this.extraDirs.map((path) => realpath(path))),
      age: new Date(now - this.minAgeDays * day).toISOString(),
      orphan: new Date(now - this.orphanHours * 3600_000).toISOString(),
      deleted: new Date(now - this.deletedDays * day).toISOString(),
      logs: new Date(now - this.logDays * day).toISOString(),
      deleteMessages: this.deleteMessages,
      skipArchived: this.skipArchived,
      protectPinned: this.protectPinned,
      limit: this.limitBytes,
      target: this.watermarkBytes,
      retention: [this.minAgeDays, this.orphanHours, this.deletedDays, this.logDays]
    }
  }
  private async *pages<T extends { id: string }>(query: (cursor?: string) => Promise<T[]>) {
    let cursor: string | undefined
    for (;;) {
      const rows = await query(cursor)
      if (!rows.length) return
      for (const row of rows) yield row
      cursor = rows[rows.length - 1].id
    }
  }
  private page(cursor?: string) {
    return {
      take: 100,
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    }
  }
  private async group(tx: Tx, id: string): Promise<Message[]> {
    return tx.message.findMany({
      where: { OR: [{ id }, { threadParentId: id }] },
      include: messageInclude,
      orderBy: { id: 'asc' },
      take: 501
    })
  }
  private async eligible(tx: Tx, rows: Message[], policy: Policy, mode: Mode) {
    if (!rows.length || rows.length > 500) return false
    for (const msg of rows) {
      if (policy.protectPinned && msg.pinned) return false
      if (
        policy.skipArchived &&
        msg.channelId &&
        (await tx.channel.findUnique({ where: { id: msg.channelId } }))?.isArchived
      )
        return false
      const cutoff = new Date(msg.deleted ? policy.deleted : policy.age)
      if (mode === 'deleted') {
        if (!msg.deleted) return false
      } else if (
        msg.createdAt >= cutoff ||
        (msg.editedAt && msg.editedAt >= cutoff) ||
        (msg.deleted && (!msg.deletedAt || msg.deletedAt >= cutoff))
      )
        return false
      if (mode !== 'deleted' && msg.attachments.some((a) => a.createdAt >= cutoff)) return false
    }
    return true
  }
  private async referenced(
    tx: Tx,
    url: string,
    excludeAttachments: string[] = [],
    excludeMessages: string[] = [],
    excludeItem = ''
  ) {
    const rows = await tx.$queryRaw<{ used: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM attachments WHERE NOT (id = ANY(${excludeAttachments}::text[])) AND (cleanup_upload_url(url) = ${url} OR cleanup_upload_url(thumbnail_url) = ${url})
        UNION ALL SELECT 1 FROM users WHERE cleanup_upload_url(avatar_url) = ${url}
        UNION ALL SELECT 1 FROM servers WHERE cleanup_upload_url(icon_url) = ${url}
        UNION ALL SELECT 1 FROM custom_emojis WHERE cleanup_upload_url(image_url) = ${url}
        UNION ALL SELECT 1 FROM webhooks WHERE cleanup_upload_url(avatar_url) = ${url}
        UNION ALL SELECT 1 FROM registered_games WHERE cleanup_upload_url(icon_url) = ${url}
        UNION ALL SELECT 1 FROM direct_conversations WHERE cleanup_upload_url(group_avatar_url) = ${url}
        UNION ALL SELECT 1 FROM messages WHERE NOT (id = ANY(${excludeMessages}::text[])) AND
          (webhook_avatar_url IS NOT NULL OR strpos(COALESCE(content,''), '/api/uploads/') > 0 OR strpos(embeds::text, '/api/uploads/') > 0) AND
          (cleanup_upload_url(webhook_avatar_url) = ${url} OR strpos(cleanup_decode_uri(COALESCE(content,'')), ${url}) > 0 OR strpos(cleanup_decode_uri(embeds::text), ${url}) > 0)
        UNION ALL SELECT 1 FROM link_previews WHERE NOT (message_id = ANY(${excludeMessages}::text[])) AND cleanup_upload_url(image_url) = ${url}
        UNION ALL SELECT 1 FROM storage_cleanup_items WHERE id <> ${excludeItem} AND status = 'deleting' AND strpos(files::text, ${url}) > 0
      ) AS used`
    return rows[0].used
  }
  private async knownPaths() {
    const known = new Set<string>()
    const queries = [
      (cursor?: string) =>
        this.prisma.attachment.findMany({ ...this.page(cursor), select: { id: true, url: true, thumbnailUrl: true } }),
      (cursor?: string) => this.prisma.user.findMany({ ...this.page(cursor), select: { id: true, avatarUrl: true } }),
      (cursor?: string) => this.prisma.server.findMany({ ...this.page(cursor), select: { id: true, iconUrl: true } }),
      (cursor?: string) =>
        this.prisma.customEmoji.findMany({ ...this.page(cursor), select: { id: true, imageUrl: true } }),
      (cursor?: string) =>
        this.prisma.webhook.findMany({ ...this.page(cursor), select: { id: true, avatarUrl: true } }),
      (cursor?: string) =>
        this.prisma.registeredGame.findMany({ ...this.page(cursor), select: { id: true, iconUrl: true } }),
      (cursor?: string) =>
        this.prisma.directConversation.findMany({ ...this.page(cursor), select: { id: true, groupAvatarUrl: true } }),
      (cursor?: string) =>
        this.prisma.linkPreview.findMany({ ...this.page(cursor), select: { id: true, imageUrl: true } }),
      (cursor?: string) =>
        this.prisma.message.findMany({
          ...this.page(cursor),
          where: {
            OR: [
              { webhookAvatarUrl: { not: null } },
              { content: { contains: '/api/uploads/' } },
              { NOT: { embeds: { equals: [] } } }
            ]
          },
          select: { id: true, webhookAvatarUrl: true, content: true, embeds: true }
        }),
      (cursor?: string) =>
        this.prisma.storageCleanupItem.findMany({
          ...this.page(cursor),
          orderBy: { id: 'asc' },
          where: { status: 'deleting' },
          select: { id: true, files: true }
        })
    ]
    for (const query of queries)
      for await (const row of this.pages<{ id: string }>(query)) {
        for (const match of JSON.stringify(row).matchAll(/\/api\/uploads\/[^?#\s"<>]+/g)) {
          const path = localUploadPath(match[0])
          if (path) known.add(path)
          if (known.size > 500_000)
            throw new Error('Reference inventory exceeded its safety bound; narrow the storage scope')
        }
      }
    return known
  }
  private async filesFor(
    rows: { url: string; thumbnailUrl?: string | null }[],
    previews: { imageUrl: string | null }[] = []
  ) {
    const files = new Map<string, PlannedFile>()
    for (const url of [...rows.flatMap((a) => [a.url, a.thumbnailUrl]), ...previews.map((p) => p.imageUrl)]) {
      const path = localUploadPath(url)
      if (!path) continue
      const file = await snapshotFile(this.uploadDir, path, `/api/uploads/${path}`)
      if (file) files.set(path, file)
    }
    return [...files.values()]
  }
  async runAudit(mode: Mode = 'pressure') {
    if (!['pressure', 'deleted', 'logs'].includes(mode)) throw new BadRequestException('Invalid audit mode')
    const policy = await this.policy(),
      stats = await this.getStorageStats()
    const audit = await this.prisma.storageAudit.create({
      data: {
        status: 'pending',
        mode,
        planVersion: VERSION,
        policy: json(policy),
        expiresAt: new Date(Date.now() + day),
        totalSizeBytes: BigInt(stats.totalBytes),
        limitBytes: BigInt(policy.limit),
        targetBytes: BigInt(policy.target),
        orphanedCount: 0,
        orphanedBytes: 0n,
        attachmentCount: 0,
        attachmentBytes: 0n,
        forumPostCount: 0,
        forumPostBytes: 0n,
        messageCount: 0,
        messageBytes: 0n,
        diskOrphanCount: 0,
        diskOrphanBytes: 0n,
        totalFreeable: 0n
      }
    })
    let sequence = 0,
      limited = false,
      planBytes = 0
    const sources = new Set<string>(),
      paths = new Set<string>()
    const totals = {
      orphanedCount: 0,
      orphanedBytes: 0n,
      attachmentCount: 0,
      attachmentBytes: 0n,
      forumPostCount: 0,
      forumPostBytes: 0n,
      messageCount: 0,
      messageBytes: 0n,
      diskOrphanCount: 0,
      diskOrphanBytes: 0n,
      totalFreeable: 0n,
      affectedMessages: 0,
      affectedAttachments: 0
    }
    const add = async (
      kind: string,
      sourceId: string | null,
      snapshot: unknown,
      files: PlannedFile[],
      countKey: 'orphanedCount' | 'attachmentCount' | 'forumPostCount' | 'messageCount' | 'diskOrphanCount'
    ) => {
      if (sequence >= this.maxItems) {
        limited = true
        return false
      }
      const ownedMessages = Array.isArray(snapshot) ? (snapshot as Message[]) : []
      const ownedAttachments = ownedMessages.flatMap((m) => m.attachments.map((a) => a.id))
      if (kind === 'attachment' || kind === 'orphan') ownedAttachments.push(sourceId!)
      const unique: PlannedFile[] = []
      for (const file of files) {
        if (paths.has(file.root + '/' + file.path)) continue
        if (
          file.url &&
          (await this.referenced(
            this.prisma,
            file.url,
            ownedAttachments,
            ownedMessages.map((m) => m.id)
          ))
        )
          continue
        unique.push(file)
      }
      if (mode === 'pressure' && (kind === 'message' || kind === 'forum') && !unique.length) return true
      const source = (Array.isArray(snapshot) ? (snapshot as Message[]).find((m) => m.id === sourceId) : snapshot) as {
        title?: string
        filename?: string
        action?: string
        createdAt?: Date
      }
      // Keep only a fingerprint and a bounded label. Purging a message must not
      // leave a second copy of its content/embeds in the audit history.
      const reviewed = {
        digest: fingerprint(snapshot),
        label: (source?.title ?? source?.filename ?? source?.action ?? kind).slice(0, 120),
        createdAt: source?.createdAt ?? null
      }
      const itemBytes = Buffer.byteLength(JSON.stringify({ reviewed, files: unique }))
      if (planBytes + itemBytes > 8 * 1024 ** 2) {
        limited = true
        return false
      }
      planBytes += itemBytes
      for (const file of unique) paths.add(file.root + '/' + file.path)
      const bytes = BigInt(unique.reduce((sum, f) => sum + f.size, 0))
      await this.prisma.storageCleanupItem.create({
        data: { auditId: audit.id, sequence: sequence++, kind, sourceId, snapshot: json(reviewed), files: json(unique) }
      })
      totals[countKey]++
      totals.affectedMessages += ownedMessages.length
      totals.affectedAttachments += ownedAttachments.length
      totals[countKey.replace('Count', 'Bytes') as 'orphanedBytes'] += bytes
      totals.totalFreeable += bytes
      return true
    }
    try {
      if (mode === 'pressure')
        for await (const att of this.pages((cursor) =>
          this.prisma.attachment.findMany({
            ...this.page(cursor),
            where: { messageId: null, createdAt: { lt: new Date(policy.orphan) } }
          })
        )) {
          if (!(await add('orphan', att.id, att, await this.filesFor([att]), 'orphanedCount'))) break
          sources.add(att.id)
        }
      if (mode === 'deleted' || (mode === 'pressure' && policy.deleteMessages)) {
        for await (const root of this.pages((cursor) =>
          this.prisma.message.findMany({
            ...this.page(cursor),
            where:
              mode === 'deleted' ? { deleted: true } : { threadParentId: null, createdAt: { lt: new Date(policy.age) } }
          })
        )) {
          if (sources.has(root.id)) continue
          const rows = await this.group(this.prisma, root.id)
          if (!(await this.eligible(this.prisma, rows, policy, mode))) continue
          const files = await this.filesFor(
            rows.flatMap((m) => m.attachments),
            rows.flatMap((m) => m.linkPreviews)
          )
          if (mode === 'pressure' && !files.length) continue
          const channel = root.channelId
            ? await this.prisma.channel.findUnique({ where: { id: root.channelId } })
            : null
          const kind = channel?.type === 'forum' ? 'forum' : 'message'
          if (!(await add(kind, root.id, rows, files, kind === 'forum' ? 'forumPostCount' : 'messageCount'))) break
          for (const msg of rows) {
            sources.add(msg.id)
            for (const att of msg.attachments) sources.add(att.id)
          }
        }
      }
      if (mode === 'pressure') {
        for await (const att of this.pages((cursor) =>
          this.prisma.attachment.findMany({
            ...this.page(cursor),
            where: { messageId: { not: null }, createdAt: { lt: new Date(policy.age) } }
          })
        )) {
          if (sources.has(att.id)) continue
          const msg = await this.prisma.message.findUnique({ where: { id: att.messageId! } })
          if (
            !msg ||
            !(await this.eligible(
              this.prisma,
              await this.group(this.prisma, msg.threadParentId ?? msg.id),
              policy,
              mode
            ))
          )
            continue
          if (!(await add('attachment', att.id, att, await this.filesFor([att]), 'attachmentCount'))) break
        }
        const known = await this.knownPaths()
        for await (const file of walkFiles(this.uploadDir)) {
          if (sequence >= this.maxItems) {
            limited = true
            break
          }
          if (file.mtime >= new Date(policy.orphan).getTime()) continue
          file.url = `/api/uploads/${file.path}`
          if (paths.has(file.root + '/' + file.path) || known.has(file.path)) continue
          await add('disk', null, {}, [file], 'diskOrphanCount')
        }
      }
      if (this.logDir && mode !== 'deleted')
        for await (const file of walkFiles(this.logDir)) {
          if (!/\.(?:gz|old|\d+)$/.test(file.path) || file.mtime >= new Date(policy.logs).getTime()) continue
          if (!(await add('logFile', null, {}, [file], 'diskOrphanCount'))) break
        }
      if (mode === 'logs') {
        for await (const row of this.pages((cursor) =>
          this.prisma.auditLog.findMany({ ...this.page(cursor), where: { createdAt: { lt: new Date(policy.logs) } } })
        )) {
          if (!(await add('auditLog', row.id, row, [], 'messageCount'))) break
        }
        for await (const row of this.pages((cursor) =>
          this.prisma.storageAudit.findMany({
            ...this.page(cursor),
            where: {
              createdAt: { lt: new Date(policy.logs) },
              status: { in: ['completed', 'executed', 'partial', 'superseded'] },
              items: { none: { status: 'deleting' } }
            }
          })
        )) {
          if (!(await add('auditHistory', row.id, { id: row.id, status: row.status }, [], 'messageCount'))) break
        }
      }
      return await this.prisma.storageAudit.update({
        where: { id: audit.id },
        data: { ...totals, planLimited: limited, status: 'completed' }
      })
    } catch (error) {
      await this.prisma.storageAudit.update({
        where: { id: audit.id },
        data: { status: 'audit_failed', error: this.error(error) }
      })
      throw error
    }
  }
  private error(error: unknown) {
    return (error instanceof Error ? error.message : String(error)).slice(0, 1000)
  }
  // Separate session lock permits durable per-item commits. Process exit releases
  // the lock; unfinished file operations remain recoverable in the manifest.
  private async exclusive<T>(run: (check: () => void) => Promise<T>): Promise<T> {
    const client = new Client({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: 5000,
      application_name: 'jablu-storage-cleanup'
    })
    let lost = false
    client.on('error', () => {
      lost = true
    })
    await client.connect()
    try {
      const result = await client.query('SELECT pg_try_advisory_lock(867239, 1) AS locked')
      if (!result.rows[0].locked) throw new ConflictException('Another cleanup is running')
      return await run(() => {
        if (lost) throw new Error('Cleanup lock connection lost; retry this audit')
      })
    } finally {
      await client.end()
    }
  }
  private async lockMessages(tx: Tx, rows: Message[]) {
    const channels = [...new Set(rows.map((m) => m.channelId).filter((id): id is string => !!id))].sort()
    if (channels.length)
      await tx.$queryRaw`SELECT id FROM channels WHERE id = ANY(${channels}::text[]) ORDER BY id FOR UPDATE`
    const ids = rows.map((m) => m.id).sort()
    if (ids.length) await tx.$queryRaw`SELECT id FROM messages WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`
  }
  private async claim(item: StorageCleanupItem, policy: Policy, mode: Mode, check: () => void) {
    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.storageCleanupItem.findUniqueOrThrow({ where: { id: item.id } })
        if (current.status === 'deleting') return current
        if (current.status !== 'pending') return null
        for (const planned of current.files as unknown as PlannedFile[]) {
          const actual = await snapshotFile(planned.root, planned.path, planned.url)
          if (actual && !equal(actual, planned))
            return tx.storageCleanupItem.update({
              where: { id: item.id },
              data: { status: 'skipped', error: 'File changed since review' }
            })
        }
        check()
        let valid = true
        if (item.kind === 'orphan' || item.kind === 'attachment') {
          const before = await tx.attachment.findUnique({ where: { id: item.sourceId! } })
          if (before?.messageId) {
            const msg = await tx.message.findUnique({ where: { id: before.messageId } })
            if (msg) await this.lockMessages(tx, await this.group(tx, msg.threadParentId ?? msg.id))
          }
          await tx.$queryRaw`SELECT id FROM attachments WHERE id = ${item.sourceId!} FOR UPDATE`
          const att = await tx.attachment.findUnique({ where: { id: item.sourceId! } })
          valid = !!att && fingerprint(att) === (item.snapshot as { digest: string }).digest
          if (valid && att?.messageId) {
            const msg = await tx.message.findUniqueOrThrow({ where: { id: att.messageId } })
            valid = await this.eligible(tx, await this.group(tx, msg.threadParentId ?? msg.id), policy, mode)
          }
          check()
          if (valid) await tx.attachment.delete({ where: { id: item.sourceId! } })
        } else if (item.kind === 'message' || item.kind === 'forum') {
          await this.lockMessages(tx, await this.group(tx, item.sourceId!))
          const rows = await this.group(tx, item.sourceId!)
          valid =
            fingerprint(rows) === (item.snapshot as { digest: string }).digest &&
            (await this.eligible(tx, rows, policy, mode))
          check()
          if (valid) await tx.message.deleteMany({ where: { id: { in: rows.map((m) => m.id) } } })
        } else if (item.kind === 'auditLog') {
          const row = await tx.auditLog.findUnique({ where: { id: item.sourceId! } })
          valid = !!row && fingerprint(row) === (item.snapshot as { digest: string }).digest
          check()
          if (valid) await tx.auditLog.delete({ where: { id: item.sourceId! } })
        } else if (item.kind === 'auditHistory') {
          check()
          const removed = await tx.storageAudit.deleteMany({
            where: {
              id: item.sourceId!,
              createdAt: { lt: new Date(policy.logs) },
              status: { in: ['completed', 'executed', 'partial', 'superseded'] },
              items: { none: { status: 'deleting' } }
            }
          })
          valid = removed.count === 1
        }
        return tx.storageCleanupItem.update({
          where: { id: item.id },
          data: { status: valid ? 'deleting' : 'skipped', error: valid ? null : 'Candidate changed or is protected' }
        })
      },
      { timeout: 30_000 }
    )
  }
  async startCleanup(auditId: string) {
    let started!: (audit: Awaited<ReturnType<CleanupService['runAudit']>>) => void
    let rejected!: (error: unknown) => void
    const ready = new Promise<Awaited<ReturnType<CleanupService['runAudit']>>>((resolve, reject) => {
      started = resolve
      rejected = reject
    })
    void this.executeCleanup(auditId, started).catch((error) => {
      rejected(error)
      this.logger.error('Cleanup failed; retry its audit to recover', error)
    })
    return ready
  }
  async executeCleanup(auditId: string, onStarted?: (audit: Awaited<ReturnType<CleanupService['runAudit']>>) => void) {
    return this.exclusive(async (check) => {
      const audit = await this.prisma.storageAudit.findUnique({ where: { id: auditId } })
      if (!audit || audit.planVersion !== VERSION) throw new BadRequestException('Create a new audit before cleanup')
      if (!['completed', 'failed', 'executing', 'interrupted'].includes(audit.status))
        throw new BadRequestException('Audit is not executable')
      const policy = audit.policy as unknown as Policy,
        live = await this.policy()
      if (policy.root !== live.root || policy.logRoot !== live.logRoot || !equal(policy.extraRoots, live.extraRoots))
        throw new BadRequestException('Storage roots changed; recover with the original configuration')
      const expired = !audit.expiresAt || audit.expiresAt.getTime() <= Date.now()
      const changed =
        policy.deleteMessages !== live.deleteMessages ||
        policy.skipArchived !== live.skipArchived ||
        policy.protectPinned !== live.protectPinned ||
        policy.limit !== live.limit ||
        policy.target !== live.target ||
        !equal(policy.retention, live.retention)
      const recovering = await this.prisma.storageCleanupItem.count({ where: { auditId, status: 'deleting' } })
      if ((expired || changed) && !recovering)
        throw new BadRequestException('Audit expired or policy changed; create a new audit')
      await this.prisma.storageAudit.updateMany({
        where: { status: 'executing', id: { not: auditId } },
        data: { status: 'interrupted', error: 'Worker stopped; retry to recover file operations' }
      })
      const executing = await this.prisma.storageAudit.update({
        where: { id: auditId },
        data: { status: 'executing', error: null }
      })
      onStarted?.(executing)
      let remaining: number
      let reason = 'eligible_data_exhausted'
      try {
        remaining = (await this.getStorageStats()).totalBytes
        for await (const item of this.pages((cursor) =>
          this.prisma.storageCleanupItem.findMany({
            ...this.page(cursor),
            orderBy: { sequence: 'asc' },
            where: { auditId, status: { in: ['pending', 'deleting'] } }
          })
        )) {
          check()
          if (item.status === 'pending' && (expired || changed)) continue
          if (item.status === 'pending' && audit.mode === 'pressure' && remaining <= policy.target) {
            reason = 'target_reached'
            continue
          }
          const claimed = await this.claim(item, policy, audit.mode as Mode, check)
          if (!claimed || claimed.status !== 'deleting') continue
          const files = claimed.files as unknown as PlannedFile[]
          let freed = Number(claimed.freedBytes)
          while (files.length) {
            check()
            const file = files[0]
            if (file.root !== policy.root && file.root !== policy.logRoot) throw new Error('Invalid planned file root')
            const protectedFile = file.url && (await this.referenced(this.prisma, file.url, [], [], item.id))
            check()
            const bytes = protectedFile ? 0 : await deletePlannedFile(file)
            freed += bytes
            remaining -= bytes
            files.shift()
            await this.prisma.storageCleanupItem.update({
              where: { id: item.id },
              data: { files: json(files), freedBytes: BigInt(freed) }
            })
          }
          await this.prisma.storageCleanupItem.update({ where: { id: item.id }, data: { status: 'done', error: null } })
          await this.prisma.storageAudit.update({ where: { id: auditId }, data: { processedItems: { increment: 1 } } })
        }
        const after = (await this.getStorageStats()).totalBytes
        const progress = await this.prisma.storageCleanupItem.aggregate({
          where: { auditId },
          _sum: { freedBytes: true }
        })
        const protectedCount = await this.prisma.storageCleanupItem.count({ where: { auditId, status: 'skipped' } })
        if (expired || changed) reason = 'recovered_files_create_new_audit'
        else if (audit.mode !== 'pressure') reason = 'reviewed_retention_completed'
        else if (after <= policy.target) reason = 'target_reached'
        else if (audit.planLimited) reason = 'plan_limit_create_new_audit'
        else if (protectedCount) reason = 'candidates_changed_or_protected'
        check()
        const result = await this.prisma.storageAudit.update({
          where: { id: auditId },
          data: {
            status: audit.mode === 'pressure' && after > policy.target ? 'partial' : 'executed',
            executedAt: new Date(),
            afterSizeBytes: BigInt(after),
            freedBytes: progress._sum.freedBytes ?? 0n,
            stopReason: reason
          }
        })
        await this.prisma.storageAudit.updateMany({
          where: { id: { not: auditId }, status: 'completed' },
          data: { status: 'superseded' }
        })
        return result
      } catch (error) {
        const progress = await this.prisma.storageCleanupItem.aggregate({
          where: { auditId },
          _sum: { freedBytes: true }
        })
        await this.prisma.storageAudit.update({
          where: { id: auditId },
          data: { status: 'failed', error: this.error(error), freedBytes: progress._sum.freedBytes ?? 0n }
        })
        throw error
      }
    })
  }
  async getAudits(limit = 30) {
    try {
      await this.exclusive(async () => {
        await this.prisma.storageAudit.updateMany({
          where: { status: 'executing' },
          data: { status: 'interrupted', error: 'Worker stopped; resume this reviewed plan to recover' }
        })
      })
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error
    }
    const shape = {
      orderBy: { createdAt: 'desc' as const },
      include: { _count: { select: { items: { where: { status: 'deleting' } } } } }
    }
    const [recent, recovery] = await Promise.all([
      this.prisma.storageAudit.findMany({ ...shape, take: Math.min(Math.max(limit, 1), 100) }),
      this.prisma.storageAudit.findMany({ ...shape, where: { items: { some: { status: 'deleting' } } }, take: 100 })
    ])
    const audits = [...new Map([...recent, ...recovery].map((audit) => [audit.id, audit])).values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )
    return audits.map(({ _count, ...audit }) => ({
      ...audit,
      canDismiss: audit.status !== 'executing' && _count.items === 0,
      canResume:
        audit.planVersion === VERSION &&
        ['failed', 'interrupted', 'executing'].includes(audit.status) &&
        (_count.items > 0 || (!!audit.expiresAt && audit.expiresAt.getTime() > Date.now()))
    }))
  }
  async getAuditItems(id: string, after = -1) {
    if (!Number.isSafeInteger(after) || after < -1) throw new BadRequestException('Invalid item cursor')
    const items = await this.prisma.storageCleanupItem.findMany({
      where: { auditId: id, sequence: { gt: after } },
      orderBy: { sequence: 'asc' },
      take: 51
    })
    return {
      items: items.slice(0, 50).map((item) => ({ ...item, freedBytes: item.freedBytes.toString() })),
      next: items.length > 50 ? items[49].sequence : null
    }
  }
  async deleteAudit(id: string) {
    return this.exclusive(async () => {
      const removed = await this.prisma.storageAudit.deleteMany({
        where: {
          id,
          status: { not: 'executing' },
          items: { none: { status: 'deleting' } }
        }
      })
      if (!removed.count) throw new ConflictException('Audit is missing or still owns recovery work')
    })
  }
}
