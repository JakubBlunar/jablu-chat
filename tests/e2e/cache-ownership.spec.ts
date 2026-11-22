import { expect, test } from '@playwright/test'

test('cache ownership survives account changes and an old tab signing out', async ({ page, context }) => {
  const other = await context.newPage()
  for (const tab of [page, other]) {
    await tab.route('**/cache-probe', route => route.fulfill({ contentType: 'text/html', body: '<title>cache probe</title>' }))
    await tab.goto('/cache-probe')
  }
  async function act(tab: typeof page, action: 'bind' | 'put' | 'get' | 'clear', value = '') {
    return tab.evaluate(async ({ action, value }) => {
      const path = '/src/lib/cache/db.ts'
      const db = await import(path)
      if (action === 'bind') return db.initCacheDb(value)
      if (action === 'put') return db.writeStructure('servers', value)
      if (action === 'clear') return db.clearCacheDb()
      return db.readStructure('servers')
    }, { action, value })
  }
  await act(page, 'bind', 'first')
  await act(page, 'put', 'first-data')
  await act(other, 'bind', 'first')
  expect(await act(other, 'get')).toBe('first-data')
  await act(other, 'bind', 'second')
  expect(await act(other, 'get')).toBeNull()
  await act(other, 'put', 'second-data')
  expect(await act(page, 'get')).toBeNull()
  await act(page, 'put', 'late')
  await act(page, 'clear')
  expect(await act(other, 'get')).toBe('second-data')
  await act(other, 'bind', 'first')
  await act(other, 'put', 'new-login')
  await act(page, 'clear')
  expect(await act(other, 'get')).toBe('new-login')
})
