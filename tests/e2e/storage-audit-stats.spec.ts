import { expect, test } from '@playwright/test'
import { getTestAdminToken } from './helpers'

test('reviewing storage shows the measured budget without a second directory scan', async ({ page, request }) => {
  const token = await getTestAdminToken(request)
  const headers = { 'x-admin-token': token }
  let auditId: string | undefined
  try {
    await page.addInitScript((value) => sessionStorage.setItem('chat-admin-token', value), token)
    await page.goto('/admin')
    await page.getByRole('button', { name: 'Storage', exact: true }).click()
    await expect(page.getByText('Jablu Instance Storage', { exact: true })).toBeVisible()
    const extraScans: string[] = []
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/api/admin/storage') extraScans.push(req.method())
    })
    const response = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/admin/storage/audit' && res.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Review Old Logs', exact: true }).click()
    const audit = await (await response).json()
    auditId = audit.id
    expect(audit.status).toBe('completed')
    expect(audit.storageStats.totalBytes).toBe(Number(audit.totalSizeBytes))
    await expect(page.getByText(/Purge reviewed old log records/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review Old Logs', exact: true })).toBeEnabled()
    expect(extraScans).toEqual([])
  } finally {
    try {
      if (auditId)
        expect(
          (await request.delete('http://localhost:3001/api/admin/storage/audits/' + auditId, { headers })).ok()
        ).toBe(true)
    } finally {
      await request.post('http://localhost:3001/api/admin/logout', { headers })
    }
  }
})
