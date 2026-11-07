import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { loginAs, apiCall, createTestServer } from './helpers'

const screenshotRun = Date.now()
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)
let page: Page, friend: Page, friendContext: BrowserContext
let server: { id: string; name: string; channels: { id: string }[] }
let channelId: string
const errors: string[] = []

async function ready() {
  await expect(page.getByRole('log')).toBeVisible()
  await page.evaluate(async () => {
    const auth = '/src/stores/auth.store.ts',
      locale = '/src/i18n/config.ts'
    const { useAuthStore } = await import(auth)
    useAuthStore.setState((s: { user: object }) => ({ user: { ...s.user, locale: 'en' } }))
    const { i18n } = await import(locale)
    await i18n.changeLanguage('en')
  })
}
async function theme(value: 'light' | 'dark') {
  await page.evaluate(async (value) => {
    const path = '/src/stores/settings.store.ts'
    const { useSettingsStore } = await import(path)
    useSettingsStore.getState().setTheme(value)
  }, value)
  await expect(page.locator('html')).toHaveAttribute('data-theme', value)
}
async function shot(name: string) {
  await page.screenshot({ path: `.playwright-mcp/private-area/${screenshotRun}/${name}.png`, fullPage: true, animations: 'disabled' })
}
async function noOverflow() {
  expect(
    await page
      .getByRole('dialog')
      .last()
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
}
test.beforeAll(async ({ browser, request }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await loginAs(page, 'admin')
  server = await createTestServer(page, request)
  channelId = server.channels[0].id
  await apiCall(page, 'createRole', server.id, {
    name: 'Reviewers with a longer role name',
    permissions: '0',
    color: '#eab308'
  })
  friendContext = await browser.newContext()
  friend = await friendContext.newPage()
  await loginAs(friend, 'user')
  const invite = await apiCall(page, 'createInvite', server.id)
  await apiCall(friend, 'post', `/api/invites/${invite.code}/join`)
  await page.goto(`/channels/${server.id}/${channelId}`)
  await ready()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
test.afterAll(async () => {
  if (server && page) await apiCall(page, 'deleteServer', server.id).catch(() => {})
  await friendContext?.close()
  await page?.close()
})

test('server settings and deeper editors fit desktop and phone in both themes', async () => {
  const tabs = [
    'Overview',
    'Welcome',
    'AFK Channel',
    'Roles',
    'Members',
    'Bans',
    'Webhooks',
    'Bots',
    'Emojis',
    'Auto-Mod',
    'Audit Log',
    'Insights',
    'Onboarding',
    'Leveling',
    'Danger Zone'
  ]
  for (const size of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'phone', width: 390, height: 844 }
  ]) {
    await page.setViewportSize(size)
    if (!(await page.getByRole('dialog', { name: 'Server Settings', exact: true }).isVisible())) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-server-settings')))
    }
    const dialog = page.getByRole('dialog', { name: 'Server Settings', exact: true })
    await expect(dialog).toBeVisible()
    for (const mode of ['light', 'dark'] as const) {
      await theme(mode)
      for (const tab of tabs) {
        await dialog.getByRole('button', { name: tab, exact: true }).first().click()
        // Tab-specific requests are local; let the newly mounted editor render.
        await page.waitForTimeout(150)
        if (tab === 'Roles') {
          await dialog.getByRole('button', { name: 'Reviewers with a longer role name', exact: true }).click()
          await expect(dialog.locator('input[type=text]').first()).toHaveValue('Reviewers with a longer role name')
        }
        if (tab === 'Members') await dialog.getByRole('button', { name: 'Manage', exact: true }).first().click()
        if (tab === 'Onboarding') await dialog.getByRole('checkbox').first().check()
        if (tab === 'Auto-Mod') {
          const toggle = dialog.getByRole('switch').first()
          if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
        }
        if (tab === 'Webhooks' && size.name === 'phone') {
          expect((await dialog.locator('#webhook-name').boundingBox())!.width).toBeGreaterThan(200)
        }
        await noOverflow()
        await shot(`${size.name}-${mode}-${tab.toLowerCase().replaceAll(' ', '-')}`)
      }
    }
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Server Settings', exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await theme('light')
  await page.getByRole('button', { name: 'Channel settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Access', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Audience', exact: true })).toBeVisible()
  await shot('channel-audience-light')
  await page.getByRole('tab', { name: 'Rule inspector', exact: true }).click()
  await shot('channel-rules-light')
  await noOverflow()
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])
})

test('unread divider clears after scrolling fully down without another incoming message', async () => {
  await page.goto(`/channels/${server.id}/${channelId}`)
  await ready()
  await page.bringToFront()
  for (let index = 0; index < 35; index++) {
    await apiCall(page, 'post', `/api/channels/${channelId}/messages`, {
      content: `Scroll regression message ${index}`
    })
  }
  const log = page.getByRole('log')
  await expect(log.getByText('Scroll regression message 34', { exact: true })).toBeVisible()
  await log.evaluate((element) => {
    element.scrollTop = 0
  })
  await apiCall(friend, 'post', `/api/channels/${channelId}/messages`, { content: 'Unread regression target' })
  await expect(page.getByTestId('new-messages-divider')).toBeAttached()
  await log.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByTestId('new-messages-divider')).toHaveCount(0)
  await expect(page.getByTestId('new-messages-pill')).toHaveCount(0)
})

test('large message groups remain compact and can show every participant', async () => {
  await page.evaluate(async (channelId) => {
    const module = '/src/stores/message.store.ts'
    const { useMessageStore } = await import(module)
    const date = new Date().toISOString()
    useMessageStore.setState({
      hasMore: false,
      hasNewer: false,
      messages: Array.from({ length: 10 }, (_, index) => ({
        id: crypto.randomUUID(),
        channelId,
        authorId: `visual-author-${index}`,
        author: {
          id: `visual-author-${index}`,
          username: `Participant ${index + 1} with a longer name`,
          avatarUrl: null
        },
        content: 'We all had exactly the same idea!',
        createdAt: date,
        reactions: []
      }))
    })
  }, channelId)
  const group = page.locator('[data-message-group]')
  await expect(group).toHaveCount(1)
  for (const mode of ['light', 'dark'] as const) {
    await theme(mode)
    for (const size of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'phone', width: 390, height: 844 }
    ]) {
      await page.setViewportSize(size)
      await shot(`group-ten-${size.name}-${mode}`)
      await group.getByRole('button', { name: 'and 8 others', exact: true }).click()
      await expect(group.getByRole('button', { name: 'Participant 10 with a longer name', exact: true })).toBeVisible()
      expect(await group.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await shot(`group-ten-expanded-${size.name}-${mode}`)
      await group.getByRole('button', { name: 'Show fewer', exact: true }).click()
    }
  }
})

test('a durable event notice highlights its server and clears when read', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/channels/${server.id}/${channelId}`)
  await ready()
  const userId = await page.evaluate(async () => {
    const path = '/src/stores/auth.store.ts'
    const { useAuthStore } = await import(path)
    return useAuthStore.getState().user.id
  })
  // Seed only this isolated server's notification; exercise the real summary
  // and read APIs. Event dispatch itself is covered by server-event tests.
  const serverRequire = createRequire(resolve('apps/server/package.json'))
  const { config } = serverRequire('dotenv')
  config({ path: ['.env.local', '.env.development', '.env'], quiet: true })
  const url = process.env.DATABASE_URL!
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Local database required')
  const { PrismaService } = serverRequire('./dist/prisma/prisma.service.js')
  const { ConfigService } = serverRequire('@nestjs/config')
  const prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }))
  await prisma.onModuleInit()
  let id: string | undefined
  try {
    id = (
      await prisma.inAppNotification.create({
        data: {
          userId,
          kind: 'server_event',
          payload: {
            serverId: server.id,
            eventName: 'Event regression test',
            state: 'started'
          }
        }
      })
    ).id
    await page.reload()
    await ready()
    const icon = page.getByRole('button', { name: server.name, exact: true })
    await expect(icon.locator('xpath=ancestor::*[@data-server-unread="true"]')).toBeVisible()
    const summary = await apiCall(page, 'get', '/api/notifications/unread-count')
    expect(summary.serverCounts[server.id]).toBe(1)
    await apiCall(page, 'markInAppNotificationRead', id)
    await expect(icon.locator('xpath=ancestor::*[@data-server-unread="true"]')).toHaveCount(0)
  } finally {
    if (id) await prisma.inAppNotification.delete({ where: { id } })
    await prisma.onModuleDestroy()
  }
})
