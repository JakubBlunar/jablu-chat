import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

async function returnToEntry(page: Page, dialog: Locator, row: Locator) {
  for (const method of ['button', 'escape', 'history']) {
    await row.scrollIntoViewIfNeeded()
    const position = () =>
      row.evaluate((el) => {
        let parent = el.parentElement
        while (parent && getComputedStyle(parent).overflowY !== 'auto') parent = parent.parentElement
        return parent?.scrollTop ?? 0
      })
    const before = await position()
    expect(before).toBeGreaterThan(0)
    const label = (await row.innerText()).trim()
    await row.click()
    await expect(dialog.getByRole('heading', { name: label, level: 1 })).toBeFocused()
    if (method === 'button') await dialog.getByRole('button').first().click()
    if (method === 'escape') await page.keyboard.press('Escape')
    if (method === 'history') await page.evaluate(() => history.back())
    await expect(row).toBeFocused()
    expect(await position()).toBe(before)
  }
}

for (const locale of ['en', 'sk']) {
  test('retains lower account and server entries at enlarged text in ' + locale, async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 460 })
    await loginAs(page, 'admin')
    const server = await createTestServer(page, request)
    try {
      const channel = server.channels.find((c: { type: string }) => c.type === 'text')
      await page.goto('/channels/' + server.id + '/' + channel.id)
      await expect(page.locator('.chat-scroll')).toBeVisible()
      await page.evaluate(async (locale) => {
        const path = '/src/i18n/config.ts'
        const auth = '/src/stores/auth.store.ts'
        const { useAuthStore } = await import(auth)
        useAuthStore.setState((s: { user: object }) => ({ user: { ...s.user, locale } }))
        const { i18n } = await import(path)
        await i18n.changeLanguage(locale)
        document.documentElement.style.fontSize = '145%'
        window.dispatchEvent(new CustomEvent('open-settings', { detail: 'sessions' }))
      }, locale)
      const dialog = page.getByRole('dialog').last()
      const sessions = dialog.locator('[data-settings-key=sessions]')
      await expect(dialog.getByRole('heading', { level: 1 })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(sessions).toBeFocused()
      await returnToEntry(page, dialog, sessions)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      const label = await page.evaluate(async () => {
        const path = '/src/i18n/config.ts'
        const { i18n } = await import(path)
        return i18n.t('a11y:openNavigationMenu')
      })
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.locator('button[aria-haspopup=menu]:not([title])').first().click()
      await page.getByRole('menu').locator('[data-menu-control=settings]').click()
      const audit = dialog.locator('[data-settings-key=audit]')
      await returnToEntry(page, dialog, audit)
    } finally {
      await apiCall(page, 'deleteServer', server.id)
    }
  })
}
