import { expect, test } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

test('phone reconnect keeps one row per message after overlapping live socket and HTTP delivery', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const channel = server.channels.find((c: { type: string }) => c.type === 'text')
    const path = '/api/channels/' + channel.id + '/messages'
    const anchor = await apiCall(page, 'post', path, { content: 'Reconnect anchor' })
    await page.goto('/channels/' + server.id + '/' + channel.id)
    await expect(page.locator('#msg-' + anchor.id)).toBeVisible()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const isCatchup = (url: URL) => url.pathname === path && url.searchParams.get('after') === anchor.id
    await page.route(isCatchup, async route => { await gate; await route.continue() })
    const pending = page.waitForRequest(req => isCatchup(new URL(req.url())))
    const completed = page.evaluate(async id => {
      const path = '/src/stores/message.store.ts'
      const { useMessageStore } = await import(path)
      await useMessageStore.getState().fetchNewerMessages(id)
    }, channel.id)
    await pending
    const duplicates = []
    try {
      for (let i = 0; i < 2; i++) {
        const message = await apiCall(page, 'post', path, { content: 'Intentional repeat' })
        duplicates.push(message.id)
        await expect(page.locator('#msg-' + message.id)).toHaveCount(1)
      }
    } finally { release() }
    await completed
    for (const id of duplicates) await expect(page.locator('#msg-' + id)).toHaveCount(1)
    await expect(page.locator('.chat-scroll').getByText('Intentional repeat', { exact: true })).toHaveCount(2)
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})
