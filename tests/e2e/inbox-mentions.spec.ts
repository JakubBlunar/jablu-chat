import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { loginAs, apiCall, createTestServer } from './helpers'
import type { InAppNotificationDto } from '../../apps/web/src/lib/api/types'

test.describe.configure({ mode: 'serial' })
let page: Page, friend: Page, friendContext: BrowserContext
let server: { id: string; name: string; channels: { id: string }[] }
let friendId: string, friendUsername: string
const screenshotRun = Date.now()
const errors: string[] = []

test.beforeAll(async ({ browser, request }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await loginAs(page, 'admin')
  server = await createTestServer(page, request)
  friendContext = await browser.newContext()
  friend = await friendContext.newPage()
  await loginAs(friend, 'user')
  const identity = await friend.evaluate(async () => {
    const path = '/src/stores/auth.store.ts'
    return (await import(path)).useAuthStore.getState().user
  })
  friendId = identity.id
  friendUsername = identity.username
  const invite = await apiCall(page, 'createInvite', server.id)
  await apiCall(friend, 'post', `/api/invites/${invite.code}/join`)
  await apiCall(page, 'patch', `/api/servers/${server.id}/members/${friendId}/profile`, { displayName: 'Reno' })
  await page.goto(`/channels/${server.id}/${server.channels[0].id}`)
  await expect(page.getByRole('log')).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/stores/auth.store.ts',
      locale = '/src/i18n/config.ts'
    const { useAuthStore } = await import(path)
    useAuthStore.setState((s: { user: object }) => ({ user: { ...s.user, locale: 'en' } }))
    await (await import(locale)).i18n.changeLanguage('en')
  })
})
test.afterAll(async () => {
  if (server && page) await apiCall(page, 'deleteServer', server.id).catch(() => {})
  await friendContext?.close()
  await page?.close()
})

test('nickname suggestions send the right account mention and survive another rename', async () => {
  const input = page.locator('.chat-composer textarea')
  await input.fill('@re')
  const option = page.getByRole('option').filter({ hasText: '@Reno' })
  await expect(option).toContainText(`@${friendUsername}`)
  await option.click()
  await expect(input).toHaveValue('@Reno ')
  await input.pressSequentially('hello from nickname regression')
  await input.press('Enter')
  const row = page
    .getByRole('log')
    .locator('[data-message-window]')
    .filter({ hasText: 'hello from nickname regression' })
  await expect(row.getByText('@Reno', { exact: true })).toBeVisible()
  const history = await apiCall(page, 'get', `/api/channels/${server.channels[0].id}/messages`)
  const message = history.messages.find((m: { content: string }) =>
    m.content.includes('hello from nickname regression')
  )
  expect(message.content).toBe(`@${friendUsername} hello from nickname regression`)
  await expect
    .poll(async () => {
      const notices = await apiCall(friend, 'getInAppNotifications')
      return notices.items.some((n: InAppNotificationDto) => n.kind === 'mention' && n.payload.messageId === message.id)
    })
    .toBe(true)
  await input.fill('@re')
  await apiCall(page, 'patch', `/api/servers/${server.id}/members/${friendId}/profile`, { displayName: 'Reno Updated' })
  await expect(page.getByRole('option').filter({ hasText: '@Reno Updated' })).toBeVisible()
  await expect(row.getByText('@Reno Updated', { exact: true })).toBeVisible()
  await page.getByRole('option').filter({ hasText: '@Reno Updated' }).click()
  await expect(input).toHaveValue('@"Reno Updated" ')
  await input.fill('')
})

test('inbox rows, dates and seen actions work in dark/light desktop and phone layouts', async () => {
  const now = Date.now()
  const notice = (
    id: string,
    kind: InAppNotificationDto['kind'],
    payload: Record<string, unknown>,
    hours: number,
    read = false
  ): InAppNotificationDto => ({
    id,
    kind,
    payload,
    createdAt: new Date(now - hours * 3600_000).toISOString(),
    updatedAt: new Date(now - hours * 3600_000).toISOString(),
    readAt: read ? new Date(now).toISOString() : null
  })
  let items = [
    notice(
      'notice-message',
      'channel_message',
      {
        authorId: friendId,
        authorName: friendUsername,
        channelName: 'general',
        serverId: server.id,
        snippet:
          'Could we make the inbox easier to scan, including a longer message with enough detail to wrap naturally on a phone?'
      },
      0
    ),
    notice(
      'notice-mention',
      'mention',
      { authorName: 'Lea', channelName: 'planning', serverId: server.id, snippet: 'Are you joining us this evening?' },
      1
    ),
    notice(
      'notice-event',
      'server_event',
      { eventName: 'Friday game night', serverId: server.id, state: 'started' },
      2
    ),
    notice('notice-level', 'level_up', { serverId: server.id, serverName: server.name, level: 2 }, 25, true),
    notice('notice-dm', 'dm_message', { authorName: 'A friend', snippet: 'See you tomorrow.' }, 26, true),
    notice('notice-friend', 'friend_request', { requesterName: 'New friend' }, 50, true)
  ]
  await page.route(/\/api\/notifications(?:\?.*)?$/, (route) => route.fulfill({ json: { items } }))
  await page.route('**/api/notifications/unread-count', (route) =>
    route.fulfill({ json: { count: items.filter((n) => !n.readAt).length, serverCounts: {} } })
  )
  await page.route('**/api/notifications/*/read', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)
    items = items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    await route.fulfill({ json: items.find((n) => n.id === id) })
  })
  await page.evaluate(async () => {
    const path = '/src/stores/inbox.store.ts'
    const { useInboxStore } = await import(path)
    useInboxStore.getState().show({ preferNotifications: true })
    useInboxStore.getState().selectTab('activity')
  })
  const dialog = page.getByRole('dialog', { name: 'Inbox', exact: true })
  await expect(dialog.locator('[data-notification-read]')).toHaveCount(6)
  await expect(dialog.getByText(/Reno Updated in #general/)).toBeVisible()
  for (const size of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'phone', width: 390, height: 844 }
  ]) {
    await page.setViewportSize(size)
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async (theme) => {
        const path = '/src/stores/settings.store.ts'
        ;(await import(path)).useSettingsStore.getState().setTheme(theme)
      }, theme)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.screenshot({
        path: `.playwright-mcp/inbox-mentions/${screenshotRun}/inbox-${size.name}-${theme}.png`,
        animations: 'disabled'
      })
    }
  }
  await dialog.getByRole('button', { name: 'Mark read', exact: true }).first().click()
  await expect(dialog.locator('[data-notification-read="false"]')).toHaveCount(2)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  expect(errors).toEqual([])
})
