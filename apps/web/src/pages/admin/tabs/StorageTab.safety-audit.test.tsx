import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StorageTab } from './StorageTab'
import { adminFetch } from '../adminApi'
import type { StorageAudit, StorageStats } from '../adminTypes'

jest.mock('../adminApi', () => ({ adminFetch: jest.fn() }))
jest.mock('@/components/ui', () => ({
  ...jest.requireActual('@/components/ui/Button'),
  Spinner: () => <span>Loading</span>
}))
const fetchAdmin = jest.mocked(adminFetch)
const stats: StorageStats = {
  dirSize: { avatars: 0, attachments: 100, thumbnails: 0, other: 0, total: 100 },
  limitBytes: 1000,
  attachmentCount: 1,
  messageCount: 1,
  orphanedAttachments: 0,
  databaseBytes: 50,
  extraBytes: 0,
  logBytes: 0,
  totalBytes: 150,
  targetBytes: 900,
  scope: 'Configured Jablu storage; other VPS apps excluded.'
}
const audit: StorageAudit = {
  id: 'latest',
  status: 'completed',
  planVersion: 1,
  mode: 'pressure',
  expiresAt: '2099-01-01T00:00:00Z',
  totalSizeBytes: '150',
  limitBytes: '1000',
  orphanedCount: 0,
  orphanedBytes: '0',
  attachmentCount: 1,
  attachmentBytes: '100',
  forumPostCount: 0,
  forumPostBytes: '0',
  messageCount: 0,
  messageBytes: '0',
  diskOrphanCount: 0,
  diskOrphanBytes: '0',
  totalFreeable: '100',
  executedAt: null,
  freedBytes: null,
  createdAt: '2026-10-27T12:00:00Z',
  affectedMessages: 0,
  affectedAttachments: 1,
  policy: {
    deleteMessages: false,
    skipArchived: true,
    protectPinned: true,
    age: '2026-07-27',
    orphan: '2026-10-26',
    deleted: '2026-09-27',
    logs: '2026-07-27'
  }
}
describe('Storage UI safety contracts', () => {
  beforeEach(() => {
    fetchAdmin.mockReset()
    fetchAdmin.mockImplementation(async (path) => {
      if (path === '/api/admin/storage') return stats as never
      if (path === '/api/admin/storage/audits') return [audit] as never
      if (path === '/api/admin/storage/cleanup/latest')
        return { ...audit, status: 'executed', freedBytes: '100' } as never
      return undefined as never
    })
  })
  async function confirm() {
    fireEvent.click(await screen.findByRole('button', { name: 'Execute Cleanup' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Cleanup' }))
    })
  }
  it('requires explicit confirmation explaining all destructive effects; cancellation sends no deletion', async () => {
    render(<StorageTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Execute Cleanup' }))
    expect(screen.getByText(/Permanently delete the reviewed files/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(fetchAdmin.mock.calls.filter(([path]) => path.includes('/cleanup/'))).toHaveLength(0)
  })
  it('shows the instance budget and included storage scope', async () => {
    render(<StorageTab />)
    expect(await screen.findByText('Jablu Instance Storage')).toBeTruthy()
    expect(screen.getByText('15.0%')).toBeTruthy()
    expect(screen.getByText(/other VPS apps excluded/)).toBeTruthy()
    expect(screen.getByText('Database (allocated)')).toBeTruthy()
  })
  it('updates the completed report and refreshes statistics after success', async () => {
    render(<StorageTab />)
    await confirm()
    await screen.findByText('executed')
    expect(screen.queryByText('Ready for cleanup')).toBeNull()
    expect(fetchAdmin.mock.calls.filter(([path]) => path === '/api/admin/storage')).toHaveLength(2)
  })
  it('reloads server state after failure and offers recovery instead of a stale ready report', async () => {
    let failed = false
    fetchAdmin.mockImplementation(async (path) => {
      if (path === '/api/admin/storage') return stats as never
      if (path === '/api/admin/storage/audits') return [{ ...audit, status: failed ? 'failed' : 'completed' }] as never
      failed = true
      throw new Error('I/O failure')
    })
    render(<StorageTab />)
    await confirm()
    await screen.findByText('I/O failure')
    expect(screen.queryByText('Ready for cleanup')).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume / Recover' })).toBeTruthy()
    expect(fetchAdmin.mock.calls.filter(([path]) => path === '/api/admin/storage/audits')).toHaveLength(2)
  })
  it('does not resurface an older completed report after the latest report executes', async () => {
    fetchAdmin.mockImplementation(async (path) => {
      if (path === '/api/admin/storage') return stats as never
      if (path === '/api/admin/storage/audits') return [audit, { ...audit, id: 'older' }] as never
      return { ...audit, status: 'executed' } as never
    })
    render(<StorageTab />)
    await confirm()
    await screen.findByText('executed')
    expect(screen.queryByRole('button', { name: 'Execute Cleanup' })).toBeNull()
  })
  it('disables dismissal while a cleanup request is pending', async () => {
    let finish!: (value: never) => void
    fetchAdmin.mockImplementation(async (path) => {
      if (path === '/api/admin/storage') return stats as never
      if (path === '/api/admin/storage/audits') return [audit] as never
      return new Promise<never>((resolve) => {
        finish = resolve
      })
    })
    render(<StorageTab />)
    await confirm()
    const dismiss = screen.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement
    expect(dismiss.disabled).toBe(true)
    fireEvent.click(dismiss)
    expect(fetchAdmin.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(0)
    await act(async () => {
      finish({ ...audit, status: 'executed' } as never)
    })
    await screen.findByText('executed')
  })
  it.each([{ planVersion: 0 }, { expiresAt: '2020-01-01' }, { status: 'superseded' }])(
    'does not execute legacy, expired or superseded reports: %j',
    async (change) => {
      fetchAdmin.mockImplementation(async (path) =>
        path === '/api/admin/storage' ? (stats as never) : ([{ ...audit, ...change }] as never)
      )
      render(<StorageTab />)
      await screen.findByText('Audit History')
      expect(screen.queryByRole('button', { name: 'Execute Cleanup' })).toBeNull()
    }
  )
  it('offers separate reviewed scopes for deleted messages and old logs', async () => {
    fetchAdmin.mockImplementation(async (path) => {
      if (path === '/api/admin/storage') return stats as never
      if (path === '/api/admin/storage/audits') return [audit] as never
      return { ...audit, id: 'logs', mode: 'logs' } as never
    })
    render(<StorageTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Review Old Logs' }))
    await waitFor(() =>
      expect(fetchAdmin).toHaveBeenCalledWith('/api/admin/storage/audit?mode=logs', { method: 'POST' })
    )
    expect(await screen.findByText(/Purge reviewed old log records/)).toBeTruthy()
  })
})
