import { test, expect } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

test('shared channel fields create and edit a real forum on desktop and fit on mobile', async ({ page, request }) => {
  test.setTimeout(90_000)
  page.setDefaultTimeout(10_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    await page.goto('/channels/' + server.id + '/' + server.channels[0].id)
    await expect
      .poll(() =>
        page.evaluate(async (serverId) => {
          const { useMemberStore } = await import('/src/stores/member.store.ts')
          return useMemberStore.getState().members.some((member: { serverId: string }) => member.serverId === serverId)
        }, server.id)
      )
      .toBe(true)
    await page.evaluate(async () => {
      const { i18n } = await import('/src/i18n/config.ts')
      const { useSettingsStore } = await import('/src/stores/settings.store.ts')
      useSettingsStore.setState({ locale: 'en' })
      await i18n.changeLanguage('en')
    })
    await page.getByRole('button', { name: server.name, exact: true }).last().click()
    await page.getByRole('menu').locator('[data-menu-control="createChannel"]').click()
    await page.locator('#create-channel-name').fill('Reuse Forum')
    await page.locator('input[type=radio][value=forum]').check()
    await page.locator('#create-forum-guidelines').fill('Shared field group guidelines')
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const channels = await apiCall(page, 'get', '/api/servers/' + server.id + '/channels')
    const forum = channels.find((channel: { name: string }) => channel.name === 'reuse-forum')
    expect(forum.postGuidelines).toBe('Shared field group guidelines')
    expect(forum.defaultLayout).toBe('grid')
    const channel = page.locator('aside').getByRole('button', { name: 'reuse-forum', exact: true }).first()
    await channel.click({ button: 'right' })
    await page.getByRole('menu').locator('[data-menu-control="edit"]').click()
    await expect(page.locator('#edit-channel-name')).toHaveValue('reuse-forum')
    await expect(page.locator('#edit-forum-guidelines')).toHaveValue('Shared field group guidelines')
    await page.locator('#edit-forum-guidelines').fill('Updated shared guidelines')
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const updated = await apiCall(page, 'get', '/api/servers/' + server.id + '/channels')
    expect(updated.find((channel: { id: string }) => channel.id === forum.id).postGuidelines).toBe(
      'Updated shared guidelines'
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
    await page.getByRole('button', { name: server.name, exact: true }).last().click()
    await page.getByRole('menu').locator('[data-menu-control="createChannel"]').click()
    await expect(page.locator('#create-channel-name')).toBeVisible()
    await expect(page.locator('[role="dialog"][inert]')).toHaveCount(0)
    await page
      .getByRole('dialog', { name: 'Create Channel', exact: true })
      .getByRole('button', { name: 'Cancel', exact: true })
      .click({ trial: true })
    expect(
      await page
        .getByRole('dialog', { name: 'Create Channel', exact: true })
        .evaluate((el) => el.scrollWidth <= el.clientWidth)
    ).toBe(true)
    await page.screenshot({ path: 'test-results/shared-channel-fields-mobile.png' })
    await page.keyboard.press('Escape')
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})
