import { expect, test, type Locator } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

async function targetSize(action: Locator) {
  await expect(action).toBeVisible()
  return action.evaluate((el) => {
    const { width, height } = el.getBoundingClientRect()
    return [width, height]
  })
}

test('server and DM header actions share targets and switch directly between DM panels', async ({ page, request }) => {
  await loginAs(page, 'admin')
  const [dm] = await apiCall(page, 'getDmConversations')
  expect(dm, 'local account has a seeded DM').toBeTruthy()
  const server = await createTestServer(page, request)
  try {
    const channel = server.channels.find((c: { type: string }) => c.type === 'text')
    for (const width of [1280, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 844 })
      for (const [kind, path] of [
        ['server', server.id + '/' + channel.id],
        ['dm', '@me/' + dm.id]
      ]) {
        await page.goto('/channels/' + path)
        await expect(page.locator('.chat-composer')).toBeVisible()
        await page.evaluate(async () => {
          const config = '/src/i18n/config.ts'
          const { i18n } = await import(config)
          await i18n.changeLanguage('en')
        })
        const header = page
          .locator('header')
          .filter({ has: page.getByRole('button', { name: width < 768 ? 'Search' : 'Pinned Messages', exact: true }) })
        const names =
          width < 768
            ? ['Open navigation menu', 'Search']
            : kind === 'dm'
              ? ['Conversation info', 'Pinned Messages', 'Start voice call']
              : ['Pinned Messages', 'Toggle member list']
        for (const name of names) {
          const action = header.getByRole('button', { name, exact: true })
          expect.soft(await targetSize(action), kind + ' ' + name + ' at ' + width).toEqual([44, 44])
          await action.click({ trial: true })
        }
        if (width === 1280 && kind === 'dm') {
          const pins = header.getByRole('button', { name: 'Pinned Messages' })
          const details = header.getByRole('button', { name: 'Conversation info' })
          const sidebar = page
            .locator('aside')
            .filter({ has: page.getByRole('button', { name: 'New Message', exact: true }) })
          expect(await targetSize(sidebar.getByRole('button', { name: 'New Message', exact: true }))).toEqual([44, 44])
          const closeDm = sidebar.getByRole('button', { name: 'Close conversation', exact: true }).first()
          await page.mouse.move(1, 1)
          await closeDm.focus()
          await expect(closeDm).toBeFocused()
          await expect(closeDm).toHaveCSS('opacity', '1')
          await pins.click()
          await expect(page.getByRole('tab', { name: 'Pins', exact: true })).toHaveAttribute('aria-selected', 'true')
          await details.click()
          await expect(
            page.getByRole('tab', { name: dm.isGroup ? 'Members' : 'Profile', exact: true })
          ).toHaveAttribute('aria-selected', 'true')
          await expect(details).toHaveAttribute('aria-expanded', 'true')
          await expect(pins).toHaveAttribute('aria-expanded', 'false')
          await details.click()
          await expect(details).toHaveAttribute('aria-expanded', 'false')
        }
      }
    }
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})
