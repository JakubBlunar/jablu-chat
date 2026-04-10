import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { ChannelType } from '../prisma-client'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'

interface DirBreakdown {
  avatars: number
  attachments: number
  thumbnails: number
  other: number
  total: number
}

export interface StorageStats {
  dirSize: DirBreakdown
  limitBytes: number
  attachmentCount: number
  messageCount: number
  orphanedAttachments: number
}

@Injectable()
export class CleanupService implements OnModuleInit {
  private readonly logger = new Logger(CleanupService.name)
  private readonly uploadDir: string
  private readonly limitBytes: number
  private readonly watermarkBytes: number
  private readonly minAgeDays: number
  private readonly orphanHours: number
  private readonly deleteMessages: boolean
  private readonly skipArchived: boolean

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    this.uploadDir = this.uploads.getUploadDir()
    const limitGb = this.config.get<number>('STORAGE_LIMIT_GB', 100)
    this.limitBytes = Math.floor(limitGb * 1024 * 1024 * 1024)
    this.watermarkBytes = Math.floor(this.limitBytes * 0.9)
    this.minAgeDays = this.config.get<number>('CLEANUP_MIN_AGE_DAYS', 30)
    this.orphanHours = this.config.get<number>('CLEANUP_ORPHAN_HOURS', 24)
    this.deleteMessages = this.config.get<string>('CLEANUP_DELETE_MESSAGES', 'false') === 'true'
    this.skipArchived = this.config.get<string>('CLEANUP_SKIP_ARCHIVED', 'true') === 'true'
  }

  onModuleInit() {
    const enabled = this.config.get<string>('CLEANUP_ENABLED', 'false') === 'true'
    if (!enabled) {
      this.logger.log('Periodic audit cron is disabled (CLEANUP_ENABLED=false)')
      return
    }

    const cronExpr = this.config.get<string>('CLEANUP_CRON', '0 3 * * *')
    const job = new CronJob(cronExpr, () => {
      void this.runScheduledAudit()
    })
    this.schedulerRegistry.addCronJob('storage-audit', job)
    job.start()
    this.logger.log(`Periodic audit cron registered: ${cronExpr}`)
  }

  private async runScheduledAudit() {
    this.logger.log('Running scheduled storage audit...')
    try {
      const audit = await this.runAudit()
      this.logger.log(
        `Audit complete: ${this.formatBytes(Number(audit.totalSizeBytes))} used, ` +
          `${this.formatBytes(Number(audit.totalFreeable))} freeable`
      )
    } catch (err) {
      this.logger.error('Scheduled audit failed', err)
    }
  }

  async calculateDirSize(dir: string): Promise<number> {
    let total = 0
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          total += await this.calculateDirSize(fullPath)
        } else if (entry.isFile()) {
          const s = await stat(fullPath)
          total += s.size
        }
      }
    } catch {
      // directory may not exist
    }
    return total
  }

  async getStorageStats(): Promise<StorageStats> {
    const [avatars, attachments, thumbnails, total] = await Promise.all([
      this.calculateDirSize(join(this.uploadDir, 'avatars')),
      this.calculateDirSize(join(this.uploadDir, 'attachments')),
      this.calculateDirSize(join(this.uploadDir, 'thumbnails')),
      this.calculateDirSize(this.uploadDir)
    ])

    const [attachmentCount, messageCount, orphanedAttachments] = await Promise.all([
      this.prisma.attachment.count(),
      this.prisma.message.count(),
      this.prisma.attachment.count({ where: { messageId: null } })
    ])

    return {
      dirSize: {
        avatars,
        attachments,
        thumbnails,
        other: total - avatars - attachments - thumbnails,
        total
      },
      limitBytes: this.limitBytes,
      attachmentCount,
      messageCount,
      orphanedAttachments
    }
  }

  async runAudit() {
    const totalSize = await this.calculateDirSize(this.uploadDir)
    const orphanCutoff = new Date(Date.now() - this.orphanHours * 3600_000)
    const ageCutoff = new Date(Date.now() - this.minAgeDays * 24 * 3600_000)

    // Phase 1: orphaned DB attachments
    const orphaned = await this.prisma.attachment.findMany({
      where: { messageId: null, createdAt: { lt: orphanCutoff } },
      select: { sizeBytes: true }
    })
    const orphanedCount = orphaned.length
    const orphanedBytes = orphaned.reduce((s, a) => s + a.sizeBytes, 0)

    // Phase 1b: disk orphans
    const { count: diskOrphanCount, bytes: diskOrphanBytes } = await this.scanDiskOrphans()

    // Phase 2: old attachments (file-only deletion)
    const archivedFilter = this.skipArchived
      ? { message: { channel: { isArchived: { not: true } } } }
      : {}
    const oldAttachments = await this.prisma.attachment.findMany({
      where: {
        messageId: { not: null },
        createdAt: { lt: ageCutoff },
        ...archivedFilter
      },
      select: { sizeBytes: true }
    })
    const attachmentCount = oldAttachments.length
    const attachmentBytes = oldAttachments.reduce((s, a) => s + a.sizeBytes, 0)

    // Phase 3: old forum root posts (with flat replies)
    const archivedMsgFilter = this.skipArchived
      ? { channel: { isArchived: { not: true } } }
      : {}
    const forumChannelWhere = this.skipArchived
      ? { type: ChannelType.forum, isArchived: { not: true } }
      : { type: ChannelType.forum }
    let forumPostCount = 0
    let forumPostBytes = 0
    let messageCount = 0
    let messageBytes = 0
    if (this.deleteMessages) {
      const oldForumPosts = await this.prisma.message.findMany({
        where: {
          createdAt: { lt: ageCutoff },
          threadParentId: null,
          channel: forumChannelWhere
        },
        select: {
          id: true,
          attachments: { select: { sizeBytes: true } },
          threadMessages: { select: { attachments: { select: { sizeBytes: true } } } }
        }
      }) as { id: string; attachments: { sizeBytes: number }[]; threadMessages: { attachments: { sizeBytes: number }[] }[] }[]
      forumPostCount = oldForumPosts.length
      forumPostBytes = oldForumPosts.reduce((sum, post) => {
        const own = post.attachments.reduce((sa: number, a) => sa + a.sizeBytes, 0)
        const replies = post.threadMessages.reduce(
          (sr: number, reply) => sr + reply.attachments.reduce((sa: number, a) => sa + a.sizeBytes, 0),
          0
        )
        return sum + own + replies
      }, 0)

      // Phase 4: old non-forum messages with attachments
      const oldMessages = await this.prisma.message.findMany({
        where: {
          createdAt: { lt: ageCutoff },
          ...archivedMsgFilter,
          OR: [{ channelId: null }, { channel: { type: { not: 'forum' } } }]
        },
        select: {
          id: true,
          attachments: { select: { sizeBytes: true } }
        }
      })
      messageCount = oldMessages.length
      messageBytes = oldMessages.reduce((s, m) => s + m.attachments.reduce((sa, a) => sa + a.sizeBytes, 0), 0)
    }

    const totalFreeable = orphanedBytes + diskOrphanBytes + attachmentBytes + forumPostBytes + messageBytes

    return this.prisma.storageAudit.create({
      data: {
        status: 'completed',
        totalSizeBytes: BigInt(Math.floor(totalSize)),
        limitBytes: BigInt(this.limitBytes),
        orphanedCount,
        orphanedBytes: BigInt(Math.floor(orphanedBytes)),
        attachmentCount,
        attachmentBytes: BigInt(Math.floor(attachmentBytes)),
        forumPostCount,
        forumPostBytes: BigInt(Math.floor(forumPostBytes)),
        messageCount,
        messageBytes: BigInt(Math.floor(messageBytes)),
        diskOrphanCount,
        diskOrphanBytes: BigInt(Math.floor(diskOrphanBytes)),
        totalFreeable: BigInt(Math.floor(totalFreeable))
      } as any
    })
  }

  async executeCleanup(auditId: string) {
    const audit = await this.prisma.storageAudit.findUnique({
      where: { id: auditId }
    })
    if (!audit || audit.status !== 'completed') {
      throw new Error('Audit not found or not in completed status')
    }

    await this.prisma.storageAudit.update({
      where: { id: auditId },
      data: { status: 'executing' }
    })

    let freedBytes = 0

    try {
      // Phase 1: orphaned DB attachments
      freedBytes += await this.cleanOrphanedAttachments()

      if ((await this.currentSize()) <= this.watermarkBytes) {
        return this.finalizeAudit(auditId, freedBytes)
      }

      // Phase 1b: disk orphans
      freedBytes += await this.cleanDiskOrphans()

      if ((await this.currentSize()) <= this.watermarkBytes) {
        return this.finalizeAudit(auditId, freedBytes)
      }

      // Phase 2: old attachments (keep messages)
      freedBytes += await this.cleanOldAttachments()

      if (!this.deleteMessages || (await this.currentSize()) <= this.watermarkBytes) {
        return this.finalizeAudit(auditId, freedBytes)
      }

      // Phase 3: old forum posts (with flat replies)
      freedBytes += await this.cleanOldForumPosts()

      if ((await this.currentSize()) <= this.watermarkBytes) {
        return this.finalizeAudit(auditId, freedBytes)
      }

      // Phase 4: old non-forum messages
      freedBytes += await this.cleanOldMessages()

      return this.finalizeAudit(auditId, freedBytes)
    } catch (err) {
      await this.prisma.storageAudit.update({
        where: { id: auditId },
        data: { status: 'failed', freedBytes: BigInt(Math.floor(freedBytes)) }
      })
      throw err
    }
  }

  private async currentSize(): Promise<number> {
    return this.calculateDirSize(this.uploadDir)
  }

  private async finalizeAudit(auditId: string, freedBytes: number) {
    return this.prisma.storageAudit.update({
      where: { id: auditId },
      data: {
        status: 'executed',
        executedAt: new Date(),
        freedBytes: BigInt(Math.floor(freedBytes))
      }
    })
  }

  private async cleanOrphanedAttachments(): Promise<number> {
    const cutoff = new Date(Date.now() - this.orphanHours * 3600_000)
    const orphans = await this.prisma.attachment.findMany({
      where: { messageId: null, createdAt: { lt: cutoff } }
    })

    let freed = 0
    for (const att of orphans) {
      this.uploads.deleteFile(att.url)
      if (att.thumbnailUrl) this.uploads.deleteFile(att.thumbnailUrl)
      freed += att.sizeBytes
    }

    if (orphans.length > 0) {
      await this.prisma.attachment.deleteMany({
        where: { id: { in: orphans.map((a) => a.id) } }
      })
      this.logger.log(`Phase 1: deleted ${orphans.length} orphaned attachments (${this.formatBytes(freed)})`)
    }

    return freed
  }

  private async cleanDiskOrphans(): Promise<number> {
    const { files } = await this.collectDiskOrphanFiles()
    let freed = 0

    for (const { path: filePath, size } of files) {
      try {
        const { unlink } = await import('fs/promises')
        await unlink(filePath)
        freed += size
      } catch {
        // file may already be gone
      }
    }

    if (files.length > 0) {
      this.logger.log(`Phase 1b: deleted ${files.length} disk orphans (${this.formatBytes(freed)})`)
    }

    return freed
  }

  private async cleanOldAttachments(): Promise<number> {
    const cutoff = new Date(Date.now() - this.minAgeDays * 24 * 3600_000)
    const BATCH = 100
    let freed = 0
    let deleted = 0
    const archivedFilter = this.skipArchived
      ? { message: { channel: { isArchived: { not: true } } } }
      : {}

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if ((await this.currentSize()) <= this.watermarkBytes) break

      const batch = await this.prisma.attachment.findMany({
        where: { messageId: { not: null }, createdAt: { lt: cutoff }, ...archivedFilter },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
        include: { message: { select: { id: true, content: true } } }
      })

      if (batch.length === 0) break

      const emptyMessageIds: string[] = []

      for (const att of batch) {
        this.uploads.deleteFile(att.url)
        if (att.thumbnailUrl) this.uploads.deleteFile(att.thumbnailUrl)
        freed += att.sizeBytes

        if (att.message && (!att.message.content || att.message.content.trim() === '')) {
          const remaining = await this.prisma.attachment.count({
            where: { messageId: att.message.id, id: { not: att.id } }
          })
          if (remaining === 0) {
            emptyMessageIds.push(att.message.id)
          }
        }
      }

      await this.prisma.attachment.deleteMany({
        where: { id: { in: batch.map((a) => a.id) } }
      })
      deleted += batch.length

      if (emptyMessageIds.length > 0) {
        await this.prisma.message.deleteMany({
          where: { id: { in: emptyMessageIds } }
        })
      }
    }

    if (deleted > 0) {
      this.logger.log(`Phase 2: deleted ${deleted} old attachments (${this.formatBytes(freed)})`)
    }

    return freed
  }

  private async cleanOldMessages(): Promise<number> {
    const cutoff = new Date(Date.now() - this.minAgeDays * 24 * 3600_000)
    const BATCH = 100
    let freed = 0
    let deleted = 0
    const archivedFilter = this.skipArchived
      ? { channel: { isArchived: { not: true } } }
      : {}
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if ((await this.currentSize()) <= this.watermarkBytes) break

      const batch = await this.prisma.message.findMany({
        where: {
          createdAt: { lt: cutoff },
          ...archivedFilter,
          OR: [{ channelId: null }, { channel: { type: { not: 'forum' } } }]
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
        include: {
          attachments: { select: { url: true, thumbnailUrl: true, sizeBytes: true } },
          linkPreviews: { select: { imageUrl: true } }
        }
      })

      if (batch.length === 0) break

      for (const msg of batch) {
        for (const att of msg.attachments) {
          this.uploads.deleteFile(att.url)
          if (att.thumbnailUrl) this.uploads.deleteFile(att.thumbnailUrl)
          freed += att.sizeBytes
        }
        for (const lp of msg.linkPreviews) {
          if (lp.imageUrl?.startsWith('/api/uploads/')) {
            this.uploads.deleteFile(lp.imageUrl)
          }
        }
      }

      await this.prisma.message.deleteMany({
        where: { id: { in: batch.map((m) => m.id) } }
      })
      deleted += batch.length
    }

    if (deleted > 0) {
      this.logger.log(`Phase 3: deleted ${deleted} old messages (${this.formatBytes(freed)})`)
    }

    return freed
  }

  private async cleanOldForumPosts(): Promise<number> {
    const cutoff = new Date(Date.now() - this.minAgeDays * 24 * 3600_000)
    const BATCH = 50
    let freed = 0
    let deletedRoots = 0
    const forumChannelWhere = this.skipArchived
      ? { type: ChannelType.forum, isArchived: { not: true } }
      : { type: ChannelType.forum }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if ((await this.currentSize()) <= this.watermarkBytes) break

      const roots = await this.prisma.message.findMany({
        where: {
          createdAt: { lt: cutoff },
          threadParentId: null,
          channel: forumChannelWhere
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: BATCH
      })

      if (roots.length === 0) break
      const rootIds = roots.map((r) => r.id)

      const messages = await this.prisma.message.findMany({
        where: {
          OR: [{ id: { in: rootIds } }, { threadParentId: { in: rootIds } }]
        },
        select: {
          id: true,
          attachments: { select: { url: true, thumbnailUrl: true, sizeBytes: true } },
          linkPreviews: { select: { imageUrl: true } }
        }
      })

      for (const msg of messages) {
        for (const att of msg.attachments) {
          this.uploads.deleteFile(att.url)
          if (att.thumbnailUrl) this.uploads.deleteFile(att.thumbnailUrl)
          freed += att.sizeBytes
        }
        for (const lp of msg.linkPreviews) {
          if (lp.imageUrl?.startsWith('/api/uploads/')) {
            this.uploads.deleteFile(lp.imageUrl)
          }
        }
      }

      await this.prisma.message.deleteMany({
        where: { id: { in: messages.map((m) => m.id) } }
      })
      deletedRoots += roots.length
    }

    if (deletedRoots > 0) {
      this.logger.log(`Phase 3: deleted ${deletedRoots} old forum posts (${this.formatBytes(freed)})`)
    }

    return freed
  }

  private async scanDiskOrphans(): Promise<{
    count: number
    bytes: number
  }> {
    const { files } = await this.collectDiskOrphanFiles()
    return {
      count: files.length,
      bytes: files.reduce((s, f) => s + f.size, 0)
    }
  }

  private async collectDiskOrphanFiles(): Promise<{
    files: { path: string; size: number }[]
  }> {
    const knownUrls = new Set<string>()

    const [attachments, users, servers, emojis, webhooks] = await Promise.all([
      this.prisma.attachment.findMany({
        select: { url: true, thumbnailUrl: true }
      }),
      this.prisma.user.findMany({
        where: { avatarUrl: { not: null } },
        select: { avatarUrl: true }
      }),
      this.prisma.server.findMany({
        where: { iconUrl: { not: null } },
        select: { iconUrl: true }
      }),
      this.prisma.customEmoji.findMany({ select: { imageUrl: true } }),
      this.prisma.webhook.findMany({
        where: { avatarUrl: { not: null } },
        select: { avatarUrl: true }
      })
    ])

    for (const a of attachments) {
      const rel = a.url.replace(/^\/api\/uploads\//, '')
      knownUrls.add(rel)
      if (a.thumbnailUrl) {
        knownUrls.add(a.thumbnailUrl.replace(/^\/api\/uploads\//, ''))
      }
    }
    for (const u of users) {
      if (u.avatarUrl) knownUrls.add(u.avatarUrl.replace(/^\/api\/uploads\//, ''))
    }
    for (const s of servers) {
      if (s.iconUrl) knownUrls.add(s.iconUrl.replace(/^\/api\/uploads\//, ''))
    }
    for (const e of emojis) {
      knownUrls.add(e.imageUrl.replace(/^\/api\/uploads\//, ''))
    }
    for (const w of webhooks) {
      if (w.avatarUrl) knownUrls.add(w.avatarUrl.replace(/^\/api\/uploads\//, ''))
    }

    const orphans: { path: string; size: number }[] = []
    for (const sub of ['avatars', 'attachments', 'thumbnails', 'emoji']) {
      const dir = join(this.uploadDir, sub)
      try {
        const entries = await readdir(dir)
        for (const name of entries) {
          const relPath = `${sub}/${name}`
          if (!knownUrls.has(relPath)) {
            const fullPath = join(dir, name)
            try {
              const s = await stat(fullPath)
              if (s.isFile()) {
                orphans.push({ path: fullPath, size: s.size })
              }
            } catch {
              // skip unreadable
            }
          }
        }
      } catch {
        // dir may not exist
      }
    }

    return { files: orphans }
  }

  async getAudits(limit = 10) {
    return this.prisma.storageAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }

  async deleteAudit(id: string) {
    return this.prisma.storageAudit.delete({ where: { id } })
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
}
