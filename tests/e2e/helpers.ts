import { type Page, expect } from '@playwright/test'
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
  const input = page.locator('[data-testid="message-input"], textarea[placeholder*="message"], div[contenteditable="true"]').first()
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
