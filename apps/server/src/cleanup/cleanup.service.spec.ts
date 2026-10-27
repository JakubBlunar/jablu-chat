import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CleanupService } from './cleanup.service'

describe('Cleanup configuration and scheduling contracts', () => {
  const scheduler = { addCronJob: jest.fn() }
  const build = (values: Record<string, unknown> = {}) =>
    new CleanupService(
      {} as never,
      { getUploadDir: () => '/cleanup-fixture/uploads' } as never,
      new ConfigService(values),
      scheduler as unknown as SchedulerRegistry
    )
  afterEach(() => {
    jest.restoreAllMocks()
    scheduler.addCronJob.mockClear()
  })

  it.each([
    ['STORAGE_LIMIT_GB', 0],
    ['STORAGE_LIMIT_GB', -1],
    ['STORAGE_LIMIT_GB', ''],
    ['STORAGE_LIMIT_GB', 'invalid'],
    ['STORAGE_LIMIT_GB', Infinity],
    ['STORAGE_LIMIT_GB', Number.MAX_VALUE],
    ['CLEANUP_MIN_AGE_DAYS', -1],
    ['CLEANUP_MIN_AGE_DAYS', 0],
    ['CLEANUP_ORPHAN_HOURS', -1],
    ['CLEANUP_TARGET_PERCENT', 0],
    ['CLEANUP_TARGET_PERCENT', 101],
    ['CLEANUP_MAX_ITEMS', 0],
    ['CLEANUP_MAX_ITEMS', 1.5],
    ['CLEANUP_DELETE_MESSAGES', 'yes'],
    ['CLEANUP_SKIP_ARCHIVED', 'no'],
    ['CLEANUP_PROTECT_PINNED', ''],
    ['CLEANUP_ENABLED', 'TRUE']
  ])('rejects unsafe configuration %s=%s', (key, value) => expect(() => build({ [key]: value })).toThrow())

  it('accepts numeric environment strings and safe defaults', () => {
    expect(() => build({ STORAGE_LIMIT_GB: '100', CLEANUP_MIN_AGE_DAYS: '90' })).not.toThrow()
  })
  it('rejects overlapping accounting roots', () => {
    expect(() => build({ STORAGE_EXTRA_DIRS: '/cleanup-fixture/uploads/nested' })).toThrow('overlap')
    expect(() => build({ CLEANUP_LOG_ARCHIVE_DIR: '/cleanup-fixture' })).toThrow('overlap')
  })
  it('does not schedule audits by default', () => {
    build().onModuleInit()
    expect(scheduler.addCronJob).not.toHaveBeenCalled()
  })
  it('registers only the report job when explicitly enabled', async () => {
    const service = build({ CLEANUP_ENABLED: 'true' })
    service.onModuleInit()
    const [name, job] = scheduler.addCronJob.mock.calls[0]
    expect(name).toBe('storage-audit')
    await job.stop()
  })
  it('scheduled work only audits, including error handling', async () => {
    const service = build(),
      audit = jest.spyOn(service, 'runAudit').mockResolvedValue({} as never)
    const execute = jest.spyOn(service, 'executeCleanup')
    await (service as any).runScheduledAudit()
    expect(audit).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    audit.mockRejectedValue(new Error('DB failure'))
    await expect((service as any).runScheduledAudit()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
  })
  it('guards the storage and deleted-message endpoints', async () => {
    const { AdminController } = await import('../admin/admin.controller')
    const { AdminAuthGuard } = await import('../admin/admin-auth.guard')
    for (const method of [
      'getStorageStats',
      'listAudits',
      'runAudit',
      'getAuditItems',
      'executeCleanup',
      'deleteAudit',
      'purgeDeletedMessages'
    ]) {
      expect(Reflect.getMetadata('__guards__', (AdminController.prototype as any)[method])).toContain(AdminAuthGuard)
    }
    await expect(Object.create(AdminController.prototype).purgeDeletedMessages()).rejects.toThrow('reviewed plan')
  })
})
