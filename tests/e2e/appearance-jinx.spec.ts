import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import type { Message, Channel } from '@chat/shared'
import { loginAs, apiCall, createTestServer } from './helpers'

const screenshotRun = Date.now()
test.describe.configure({ mode: 'serial' })
let page: Page, friend: Page, friendContext: BrowserContext
let serverId: string, channel: Channel
const errors: string[] = []

async function english(target: Page) {
  await target.evaluate(async () => {
    const authPath = '/src/stores/auth.store.ts'
    const i18nPath = '/src/i18n/config.ts'
    const { useAuthStore } = await import(authPath)
    useAuthStore.setState((s: { user: object }) => ({ user: { ...s.user, locale: 'en' } }))
    const { i18n } = await import(i18nPath)
    await i18n.changeLanguage('en')
  })
}

async function theme(value: 'light' | 'dark' | 'system') {
  await page.evaluate(async (value) => {
    const path = '/src/stores/settings.store.ts'
    const { useSettingsStore } = await import(path)
    useSettingsStore.getState().setTheme(value)
  }, value)
}

test.beforeAll(async ({ browser, request }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await loginAs(page, 'user')
  await english(page)
  const server = await createTestServer(page, request)
  serverId = server.id
  const channels = (await apiCall(page, 'get', `/api/servers/${serverId}/channels`)) as Channel[]
  channel = channels.find((c) => c.type === 'text')!
  expect(channel).toBeTruthy()
  friendContext = await browser.newContext()
  friend = await friendContext.newPage()
  await loginAs(friend, 'admin')
  const invite = await apiCall(page, 'post', `/api/servers/${serverId}/invites`, {})
  await apiCall(friend, 'post', `/api/invites/${invite.code}/join`)
  await page.goto(`/channels/${serverId}/${channel.id}`)
  await expect(page.getByRole('log')).toBeVisible()
  await english(page)
})

test.afterAll(async () => {
  if (serverId && page) await apiCall(page, 'delete', `/api/servers/${serverId}`).catch(() => {})
  await friendContext?.close()
  await page?.close()
})

test('groups live messages, batches reactions, preserves links, and splits/rejoins edits', async () => {
  // Avoid a calendar-minute boundary between two real API sends.
  if (Date.now() % 60_000 > 57_000) await page.waitForTimeout(3_100)
  const content = `Same brain, same minute! ${Date.now()}`
  const first = (await apiCall(page, 'post', `/api/channels/${channel.id}/messages`, { content })) as Message
  const second = (await apiCall(friend, 'post', `/api/channels/${channel.id}/messages`, { content })) as Message
  const group = page.locator('[data-message-group]')
  await expect(group).toHaveCount(1)
  await expect(group.getByText(content, { exact: true })).toHaveCount(1)
  await expect(page.locator(`#msg-${second.id}`)).toBeAttached()
  await group.getByRole('button', { name: 'React to all', exact: true }).click()
  await expect(page.locator('em-emoji-picker')).toBeVisible()
  await page.locator('em-emoji-picker').getByRole('button', { name: '👍', exact: true }).first().click()
  const reacted = async () => {
    const history = await apiCall(page, 'get', `/api/channels/${channel.id}/messages`)
    return history.messages
      .filter((m: Message) => [first.id, second.id].includes(m.id))
      .map((m: Message) => (m.reactions ?? []).find((r) => r.emoji === '👍')?.count ?? 0)
  }
  await expect.poll(reacted).toEqual([1, 1])
  await expect(group.getByRole('button', { name: '👍 1', exact: true })).toBeVisible()
  await group.getByRole('button', { name: '👍 1', exact: true }).click()
  await expect.poll(reacted).toEqual([0, 0])
  await page.locator('.chat-composer textarea').press('ArrowUp')
  const editor = group.locator('textarea')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveValue(content)
  await editor.press('Escape')
  await group.getByRole('button', { name: 'Hide originals', exact: true }).click()
  await group.getByRole('button', { name: 'Show 2 originals' }).click()
  await expect(group.getByText(content, { exact: true })).toHaveCount(3)
  await apiCall(friend, 'patch', `/api/channels/${channel.id}/messages/${second.id}`, {
    content: 'Edited independently'
  })
  await expect(group).toHaveCount(0)
  await expect(page.getByRole('log').getByText('Edited independently', { exact: true })).toBeVisible()
  await apiCall(friend, 'patch', `/api/channels/${channel.id}/messages/${second.id}`, { content })
  await expect(group).toHaveCount(1)
  await page.reload()
  await english(page)
  await expect(group).toHaveCount(1)
  await theme('light')
  await page.screenshot({
    path: `.playwright-mcp/appearance-jinx/${screenshotRun}/group-light.png`,
    fullPage: true,
    animations: 'disabled'
  })
  await theme('dark')
  await page.screenshot({
    path: `.playwright-mcp/appearance-jinx/${screenshotRun}/group-dark.png`,
    fullPage: true,
    animations: 'disabled'
  })
})

test('light/dark/system, persistence, private scope, and desktop/phone settings', async () => {
  await page.emulateMedia({ colorScheme: 'light' })
  await theme('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await theme('light')
  await page.reload()
  await expect(page.getByRole('log')).toBeVisible()
  await english(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'phone', width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.getByRole('log')).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-settings', { detail: 'appearance' })))
    const selector = page.locator('#jablu-theme')
    await expect(selector).toBeVisible()
    for (const value of ['light', 'dark'] as const) {
      await selector.selectOption(value)
      await expect(page.locator('html')).toHaveAttribute('data-theme', value)
      await selector.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `.playwright-mcp/appearance-jinx/settings-${viewport.name}-${value}.png`,
        fullPage: true,
        animations: 'disabled'
      })
    }
    if (viewport.name === 'phone') await page.getByRole('button', { name: 'Back to settings', exact: true }).click()
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await theme('light')
    await expect(page.locator('.chat-composer')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await page.screenshot({
      path: `.playwright-mcp/appearance-jinx/chat-${viewport.name}-light.png`,
      fullPage: true,
      animations: 'disabled'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const section of ['account', 'profile', 'privacy', 'notifications', 'voice', 'shortcuts']) {
    await page.evaluate(
      (section) => window.dispatchEvent(new CustomEvent('open-settings', { detail: section })),
      section
    )
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible()
    await page.screenshot({
      path: `.playwright-mcp/appearance-jinx/${screenshotRun}/${section}-light.png`,
      fullPage: true,
      animations: 'disabled'
    })
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
  }
  await theme('light')
  await page.goto('/admin')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.goto('/login')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(errors).toEqual([])
})
