import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { loginAs, createTestServer, apiCall } from './helpers'

// The mutation test creates its own server; large lists use browser response fixtures.

async function english(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/i18n/config.ts'
    const { i18n } = await import(/* @vite-ignore */ path)
    await i18n.changeLanguage('en')
  })
}

async function mobileSettings(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/stores/toast.store.ts'
    const { useToastStore } = await import(/* @vite-ignore */ path)
    useToastStore.setState({ toasts: [] })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  // At this breakpoint the desktop sidebar is replaced by the navigation drawer.
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
  await page.locator('button[aria-haspopup="menu"]:not([title])').first().click()
  await page.getByRole('menu').locator('[data-menu-control="settings"]').click()
  await expect(page.getByRole('dialog', { name: 'Server Settings', exact: true })).toBeVisible()
}

async function openSettings(page: Page, serverId: string, channelId: string) {
  await page.goto(`/channels/${serverId}/${channelId}`)
  await expect(page.locator('aside').first()).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/stores/member.store.ts'
        const { useMemberStore } = await import(/* @vite-ignore */ path)
        return useMemberStore.getState().members.length
      })
    )
    .toBeGreaterThan(0)
  await english(page)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-server-settings')))
  await expect(page.getByRole('dialog', { name: 'Server Settings', exact: true })).toBeVisible()
}

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHklEQVQ4jWP4sIDhPyWYYdSA/6NhwDAaBguGRRgAAAONjx92Hs4cAAAAAElFTkSuQmCC',
  'base64'
)

test('server settings save and moderate real local data', async ({ page, request }) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(10_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const credentials = JSON.parse(readFileSync('.playwright-mcp/.test-credentials.json', 'utf8')).user
    const login = await request.post('http://localhost:3001/api/auth/login', { data: credentials })
    expect(login.ok()).toBeTruthy()
    const user = await login.json()
    const invite = await apiCall(page, 'createInvite', server.id)
    const join = () =>
      request.post(`http://localhost:3001/api/invites/${invite.code}/join`, {
        headers: { Authorization: `Bearer ${user.accessToken}` }
      })
    expect((await join()).ok()).toBeTruthy()
    const role = await apiCall(page, 'createRole', server.id, { name: 'QA Readers', permissions: '0' })
    await apiCall(page, 'updateRole', server.id, role.id, { selfAssignable: true })
    await openSettings(page, server.id, server.channels[0].id)
    const dialog = page.getByRole('dialog', { name: 'Server Settings', exact: true })
    const tab = (name: string) => dialog.getByRole('button', { name, exact: true }).click()

    await page.locator('#overview-server-name').fill('Settings QA renamed')
    await dialog.getByRole('button', { name: 'Save', exact: true }).first().click()
    await expect(dialog.getByRole('status')).toHaveText('Changes saved.')
    await expect(dialog.getByRole('button', { name: 'Save', exact: true }).first()).toBeDisabled()
    await page.locator('#overview-vanity').fill(`qa-${server.id.slice(0, 8)}`)
    await dialog.getByRole('button', { name: 'Save', exact: true }).last().click()
    await expect(dialog.getByRole('button', { name: 'Save', exact: true }).last()).toBeDisabled()
    await dialog.locator('input[type=file]').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: tinyPng })
    await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0)

    await tab('Members')
    await dialog.getByRole('textbox', { name: 'Search members' }).fill(user.user.username)
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')
    await dialog.getByRole('button', { name: 'Manage', exact: true }).click()
    await dialog.getByRole('button', { name: 'Roles', exact: true }).last().click()
    await page.getByRole('option', { name: 'QA Readers', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Save roles', exact: true }).click()
    await expect
      .poll(async () => {
        const members = await apiCall(page, 'get', `/api/servers/${server.id}/members`)
        return members
          .find((m: { userId: string }) => m.userId === user.user.id)
          .roles.some((r: { role: { id: string } }) => r.role.id === role.id)
      })
      .toBe(true)
    await dialog.getByRole('button', { name: 'Edit server profile', exact: true }).click()
    await page.locator('#server-profile-name').fill('QA local nickname')
    await page.getByRole('dialog').last().getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByText('QA local nickname', { exact: true })).toBeVisible()
    page.once('dialog', (d) => d.accept('QA timeout reason'))
    await dialog.getByRole('combobox', { name: 'Timeout', exact: true }).selectOption('60')
    await expect(dialog.getByRole('button', { name: 'Untimeout', exact: true })).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Filter by status' }).selectOption('timed-out')
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')
    await dialog.getByRole('button', { name: 'Untimeout', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('0–0 of 0')
    await dialog.getByRole('combobox', { name: 'Filter by status' }).selectOption('')
    await page.screenshot({ path: 'test-results/settings-member-actions-desktop.png' })
    page.once('dialog', (d) => d.accept('QA ban reason'))
    await dialog.getByRole('button', { name: 'Ban member', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('0–0 of 0')

    await tab('Bans')
    await dialog.getByRole('textbox', { name: 'Search users, reasons or moderators' }).fill('QA ban reason')
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')
    page.once('dialog', (d) => d.accept())
    await dialog.getByRole('button', { name: 'Unban', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('0–0 of 0')
    expect((await join()).ok()).toBeTruthy()
    await tab('Members')
    await dialog.getByRole('textbox', { name: 'Search members' }).fill(user.user.username)
    await dialog.getByRole('button', { name: 'Manage', exact: true }).click()
    page.once('dialog', (d) => d.accept())
    await dialog.getByRole('button', { name: 'Kick member', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('0–0 of 0')

    await tab('Onboarding')
    await expect(dialog.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    await dialog.getByRole('checkbox').check()
    await dialog.getByRole('textbox', { name: 'Welcome Message' }).fill('Welcome to the QA server!')
    await dialog.getByRole('textbox', { name: 'Search selectable roles' }).fill('Readers')
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
    const onboarding = await apiCall(page, 'getOnboardingConfig', server.id)
    expect(onboarding.onboardingMessage).toBe('Welcome to the QA server!')
    expect(onboarding.onboardingEnabled).toBe(true)

    await tab('Emojis')
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'qa_emoji.png', mimeType: 'image/png', buffer: tinyPng })
    await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(dialog.getByText(':qa_emoji:', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).last().fill('qa_renamed')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByText(':qa_renamed:', { exact: true })).toBeVisible()
    page.once('dialog', (d) => d.accept())
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByText(':qa_renamed:', { exact: true })).toHaveCount(0)

    // Enough real entries to exercise both directions of cursor pagination.
    for (let i = 0; i < 26; i++) await apiCall(page, 'updateServer', server.id, { name: `Settings audit QA ${i}` })
    await apiCall(page, 'updateServer', server.id, { name: 'Settings QA renamed' })
    await tab('Audit Log')
    await expect(dialog.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('Page 2')
    await dialog.getByRole('button', { name: 'Previous page', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('Page 1')
    await dialog.getByRole('combobox', { name: 'Filter by action' }).selectOption('member.ban')
    await dialog.getByRole('textbox', { name: 'Search moderator, details or target ID' }).fill('QA ban reason')
    await expect(dialog.getByText('QA ban reason', { exact: true })).toBeVisible()
    await page.screenshot({ path: 'test-results/settings-audit-desktop.png' })
    await mobileSettings(page)
    for (const name of ['Overview', 'Members', 'Bans', 'Onboarding', 'Emojis', 'Audit Log']) {
      await page.getByRole('dialog').getByRole('button', { name, exact: true }).click()
      await page.waitForTimeout(350)
      expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.screenshot({ path: `test-results/settings-${name.toLowerCase().replaceAll(' ', '-')}-mobile.png` })
    }
  } finally {
    await apiCall(page, 'deleteServer', server.id)
    const remaining = await apiCall(page, 'get', '/api/servers')
    expect(remaining.some((value: { id: string }) => value.id === server.id)).toBe(false)
  }
})

test('large lists paginate, reset filters, and recover from a failed audit request', async ({ page }) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(10_000)
  await loginAs(page, 'admin')
  await expect(page).toHaveURL(/\/channels\/[^/]+\/[^/]+$/)
  const serverId = new URL(page.url()).pathname.split('/')[2]
  const server = await apiCall(page, 'get', `/api/servers/${serverId}`)
  try {
    const original = await apiCall(page, 'get', `/api/servers/${server.id}/members`)
    const members = [
      original[0],
      ...Array.from({ length: 22 }, (_, i) => ({
        ...original[0],
        userId: `qa-${i}`,
        roles: [],
        user: {
          ...original[0].user,
          id: `qa-${i}`,
          username: `qa_member_${String(i).padStart(2, '0')}`,
          displayName: `QA Member ${i}`
        }
      }))
    ]
    await page.route(`**/api/servers/${server.id}/members`, (route) => route.fulfill({ json: members }))
    await openSettings(page, server.id, server.channels[0].id)
    const dialog = page.getByRole('dialog', { name: 'Server Settings', exact: true })
    await dialog.getByRole('button', { name: 'Members', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('1–10 of 23')
    await dialog.getByRole('button', { name: 'Next page' }).click()
    await expect(dialog.getByRole('status')).toHaveText('11–20 of 23')
    await dialog.getByRole('button', { name: 'Next page' }).click()
    await expect(dialog.getByRole('status')).toHaveText('21–23 of 23')
    await expect(dialog.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await dialog.getByRole('textbox', { name: 'Search members' }).fill('qa_member_21')
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')
    await dialog.getByRole('textbox', { name: 'Search members' }).fill('no-such-member')
    await expect(dialog.getByRole('status')).toHaveText('0–0 of 0')
    await dialog.getByRole('textbox', { name: 'Search members' }).fill('')
    await dialog.getByRole('combobox', { name: 'Rows per page' }).selectOption('25')
    await expect(dialog.getByRole('status')).toHaveText('1–23 of 23')
    await page.screenshot({ path: 'test-results/settings-members-desktop.png' })

    const bans = Array.from({ length: 22 }, (_, i) => ({
      id: `ban-${i}`,
      userId: `qa-${i}`,
      user: members[i + 1].user,
      bannedBy: original[0].user,
      reason: `Reason ${i}`,
      createdAt: new Date().toISOString()
    }))
    await page.route(`**/api/servers/${server.id}/bans`, (route) => route.fulfill({ json: bans }))
    await dialog.getByRole('button', { name: 'Bans', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('1–10 of 22')
    await dialog.getByRole('button', { name: 'Next page' }).click()
    await expect(dialog.getByRole('status')).toHaveText('11–20 of 22')
    await dialog.getByRole('textbox', { name: 'Search users, reasons or moderators' }).fill('Reason 21')
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')

    const emojis = Array.from({ length: 22 }, (_, i) => ({
      id: `emoji-${i}`,
      name: `emoji_${String(i).padStart(2, '0')}`,
      imageUrl: '/favicon.svg'
    }))
    await page.route(`**/api/servers/${server.id}/emojis`, (route) => route.fulfill({ json: emojis }))
    await dialog.getByRole('button', { name: 'Emojis', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('1–10 of 22')
    await dialog.getByRole('button', { name: 'Next page' }).click()
    await expect(dialog.getByRole('status')).toHaveText('11–20 of 22')
    await dialog.getByRole('textbox', { name: 'Search emojis' }).fill('emoji_21')
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')

    const onboarding = await apiCall(page, 'getOnboardingConfig', server.id)
    await page.route(`**/api/servers/${server.id}/onboarding`, (route) =>
      route.fulfill({
        json: {
          ...onboarding,
          onboardingEnabled: true,
          roles: Array.from({ length: 22 }, (_, i) => ({
            id: `role-${i}`,
            name: `Selectable role ${i}`,
            color: '#ffffff',
            selfAssignable: true
          }))
        }
      })
    )
    await dialog.getByRole('button', { name: 'Onboarding', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('1–10 of 22')
    await dialog.getByRole('button', { name: 'Next page' }).click()
    await expect(dialog.getByRole('status')).toHaveText('11–20 of 22')
    await dialog.getByRole('textbox', { name: 'Search selectable roles' }).fill('role 21')
    await expect(dialog.getByRole('status')).toHaveText('1–1 of 1')

    let fail = true
    await page.route(`**/api/servers/${server.id}/audit-log*`, (route) =>
      fail ? route.fulfill({ status: 503, json: { message: 'QA temporary failure' } }) : route.continue()
    )
    await dialog.getByRole('button', { name: 'Audit Log', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Retry' })).toBeVisible()
    fail = false
    await dialog.getByRole('button', { name: 'Retry' }).click()
    await expect(dialog.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    await mobileSettings(page)
    for (const name of ['Overview', 'Members', 'Bans', 'Onboarding', 'Emojis', 'Audit Log']) {
      await page.getByRole('dialog').getByRole('button', { name, exact: true }).click()
      await page.waitForTimeout(350)
      expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.screenshot({ path: `test-results/settings-${name.toLowerCase().replaceAll(' ', '-')}-mobile.png` })
    }
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'ignoreErrors' })
  }
})
