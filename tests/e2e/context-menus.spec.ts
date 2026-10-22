import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('sidebar context menus keep navigation unchanged and reuse header actions', async ({ page }) => {
  await loginAs(page, 'admin')
  await expect(page).toHaveURL(/\/channels\/[^/]+\/[^/]+$/)
  const server = page.locator('button[title][aria-haspopup="menu"]').first()
  await expect(server).toBeVisible()
  const url = page.url()
  await server.click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu.locator('[data-menu-control="profile"]')).toBeVisible()
  await expect(menu.locator('[data-menu-control="notifications"]')).toBeVisible()
  await menu.locator('[data-menu-control="move"]').click()
  await expect(menu.locator('[data-menu-control="root"]')).toBeVisible()
  await expect(page).toHaveURL(url)
  await page.keyboard.press('Escape')

  await server.click({ button: 'right' })
  await menu.locator('[data-menu-control="profile"]').click()
  await expect(page.locator('#server-profile-name')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(url)

  const header = page.locator('aside button[aria-haspopup="menu"]:not([title])').first()
  await header.click()
  await expect(menu.locator('[data-menu-control="createChannel"]')).toBeVisible()
  await expect(menu.locator('[data-menu-control="read"]')).toBeVisible()
  await page.keyboard.press('Escape')

  const category = page.locator('button[aria-haspopup="menu"].min-w-0.flex-1').first()
  if (await category.count()) {
    await category.click({ button: 'right' })
    await expect(menu.locator('[data-menu-control="create"]')).toBeVisible()
    await expect(menu.locator('[data-menu-control="edit"]')).toBeVisible()
    await page.keyboard.press('Escape')
  }
})

test.describe('touch context menus', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a real touch hold opens one sheet and its dialogs stay above the navigation drawer', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(/\/channels\/[^/]+\/[^/]+$/)
    await page
      .getByRole('button', { name: /^(Open navigation menu|Otvoriť navigačné menu|Otevřít navigační menu)$/ })
      .click()
    const server = page.locator('button[title][aria-haspopup="menu"]').first()
    await expect(server).toBeVisible()
    await expect.poll(async () => (await server.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0)
    const url = page.url()
    const rect = await server.boundingBox()
    if (!rect) throw new Error('Server icon has no touch target')
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }]
    })
    await expect(page.getByRole('menu')).toBeVisible()
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.getByRole('menu')).toHaveCount(1)
    await expect(page).toHaveURL(url)
    await page.screenshot({ path: 'test-results/context-menu-mobile.png' })
    await page.getByRole('menu').locator('[data-menu-control="notifications"]').click()
    const dialog = page.getByRole('dialog').last()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button').first()).toBeEnabled()
    await dialog.getByRole('button').first().focus()
    await expect(dialog.getByRole('button').first()).toBeFocused()
    await expect(page).toHaveURL(url)
  })
})
