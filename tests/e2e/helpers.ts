import { type Page, type APIRequestContext, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

interface Credentials {
  admin: { email: string; password: string }
  user: { email: string; password: string }
}

let _creds: Credentials | null = null
function loadCredentials(): Credentials {
  if (_creds) return _creds
  const raw = fs.readFileSync(path.resolve(__dirname, '../../.playwright-mcp/.test-credentials.json'), 'utf-8')
  _creds = JSON.parse(raw)
  return _creds!
}

export async function loginAs(page: Page, role: 'admin' | 'user') {
  const creds = loadCredentials()
  const { email, password } = creds[role]
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const url = page.url()
  if (!url.includes('/login') && !url.includes('/register')) {
    return
  }

  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 15_000 })
}

export async function navigateToFirstTextChannel(page: Page) {
  await page.waitForSelector('[data-testid="channel-list"], [class*="channel"]', { timeout: 10_000 })
  const textChannels = page.locator('a[href*="/channels/"]').filter({ hasNotText: /forum/i })
  const first = textChannels.first()
  if (await first.isVisible()) {
    await first.click()
    await page.waitForTimeout(500)
  }
}

export async function sendMessage(page: Page, content: string) {
  const input = page
    .locator('[data-testid="message-input"], textarea[placeholder*="message" i], div[contenteditable="true"]')
    .first()
  await input.click()
  await input.fill(content)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
}

export async function waitForMessages(page: Page, minCount = 1) {
  await expect(page.locator('[id^="msg-"]').first()).toBeVisible({ timeout: 10_000 })
  const count = await page.locator('[id^="msg-"]').count()
  expect(count).toBeGreaterThanOrEqual(minCount)
}

export async function createTestServer(page: Page, request: APIRequestContext) {
  const env = Object.fromEntries(
    ['.env', '.env.development', '.env.local'].filter(fs.existsSync).flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .flatMap((line) => {
          const match = /^(SUPERADMIN_\w+)=(.*)$/.exec(line)
          return match ? [[match[1], match[2].replace(/^["']|["']$/g, '')]] : []
        })
    )
  )
  const response = await request.post('http://localhost:3001/api/admin/login', {
    data: {
      username: process.env.SUPERADMIN_USERNAME ?? env.SUPERADMIN_USERNAME,
      password: process.env.SUPERADMIN_PASSWORD ?? env.SUPERADMIN_PASSWORD
    }
  })
  const auth = await response.json()
  expect(auth.ok).toBe(true)
  const ownerUserId = await page.evaluate(async () => {
    const path = '/src/stores/auth.store.ts'
    const { useAuthStore } = await import(/* @vite-ignore */ path)
    return useAuthStore.getState().user.id
  })
  const created = await request.post('http://localhost:3001/api/admin/servers', {
    headers: { 'x-admin-token': auth.token },
    data: { name: `Settings QA ${Date.now()}`, ownerUserId }
  })
  expect(created.ok()).toBe(true)
  const server = await created.json()
  await request.post('http://localhost:3001/api/admin/logout', { headers: { 'x-admin-token': auth.token } })
  return apiCall(page, 'get', `/api/servers/${server.id}`)
}

export async function apiCall(page: Page, method: string, ...args: unknown[]) {
  return page.evaluate(
    async ({ method, args }) => {
      const path = '/src/lib/api'
      const { api } = await import(/* @vite-ignore */ path)
      return api[method](...args)
    },
    { method, args }
  )
}
