import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

test('disk-only history reopens offline and honors edits, deletions, DM closure and access loss', async ({
  page,
  context
}) => {
  await loginAs(page, 'admin')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cachePath = '/src/lib/cache/db.ts'
        const authPath = '/src/stores/auth.store.ts'
        const { cacheOwnedBy } = await import(cachePath)
        const { useAuthStore } = await import(authPath)
        return cacheOwnedBy(useAuthStore.getState().user?.id)
      })
    )
    .toBe(true)
  const key = 'qa-offline-channel'
  await page.evaluate(async (key) => {
    const path = '/src/lib/cache/'
    const memory = await import(path + 'messageCache.ts')
    const { pendingDiskWrite } = await import(path + 'messageDiskMirror.ts')
    const { cacheUpdateMessage, cacheRemoveMessage } = await import(path + 'contextMutations.ts')
    const { hydrateContextFromDisk } = await import(path + 'hydrate.ts')
    const store = '/src/stores/'
    const { useDmStore } = await import(store + 'dm.store.ts')
    const { useChannelPermissionsStore } = await import(store + 'channel-permissions.store.ts')
    const base = Date.now() - 2000
    const entry = {
      hasMore: false,
      hasNewer: false,
      messages: [{ id: 'one', channelId: key, content: 'before' }, { id: 'two' }]
    }
    memory.putContext('dm:qa-closed', entry)
    memory.putContext('ch:qa-denied', entry)
    memory.putContext('ch:' + key, entry)
    for (let i = 0; i < 31; i++) memory.putContext('ch:qa-page-' + i, { ...entry, updatedAt: base + i })
    if (memory.hasContext('ch:' + key)) throw Error('Expected a disk-only conversation')
    cacheUpdateMessage({ id: 'one', channelId: key, content: 'edited' })
    cacheRemoveMessage('ch:' + key, 'two')
    useDmStore.getState().removeConversation('qa-closed')
    Object.assign(window, { qaCache: { memory, pendingDiskWrite, hydrateContextFromDisk, useChannelPermissionsStore } })
  }, key)
  await page.route('**/api/servers/qa-server/channels/permissions/me', (route) =>
    route.fulfill({ json: { 'qa-denied': '0' } })
  )
  await page.evaluate(async () => {
    const { useChannelPermissionsStore, pendingDiskWrite } = (window as any).qaCache
    await useChannelPermissionsStore.getState().fetchChannelPermissions('qa-server')
    await Promise.all(['ch:qa-denied', 'dm:qa-closed', 'ch:qa-offline-channel'].map((key) => pendingDiskWrite(key)))
  })
  await context.setOffline(true)
  const result = await page.evaluate(async (key) => {
    const { memory, hydrateContextFromDisk } = (window as any).qaCache
    const reopened = await hydrateContextFromDisk('ch:' + key)
    return {
      reopened,
      messages: memory.peekContext('ch:' + key)?.messages,
      closed: await hydrateContextFromDisk('dm:qa-closed'),
      denied: await hydrateContextFromDisk('ch:qa-denied')
    }
  }, key)
  expect(result).toEqual({
    reopened: true,
    messages: [{ id: 'one', channelId: key, content: 'edited' }],
    closed: false,
    denied: false
  })
})
