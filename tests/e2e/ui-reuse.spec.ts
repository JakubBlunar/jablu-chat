import { test, expect, type Page } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

async function openServer(page: Page, server: { id: string; channels: { id: string }[] }) {
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
}

test('shared composer suggestions support keyboard, pointer and mobile selection without sending early', async ({
  page,
  request
}) => {
  page.setDefaultTimeout(10_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    await openServer(page, server)
    const input = page.locator('.chat-composer textarea')
    await input.fill('@eve')
    await expect(page.getByRole('option')).toHaveCount(1)
    await input.press('Enter')
    await expect(input).toHaveValue('@everyone ')
    await input.fill('#gen')
    await expect(page.getByRole('option', { name: 'general', exact: true })).toBeVisible()
    await input.press('Tab')
    await expect(input).toHaveValue('#general ')
    await input.fill('/shr')
    await expect(page.getByRole('option').filter({ hasText: '/shrug' })).toBeVisible()
    await input.press('Enter')
    await expect(input).toHaveValue('/shrug ')
    await input.fill('@eve')
    await expect(page.getByRole('option').filter({ hasText: '@everyone' })).toBeVisible()
    await input.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(input).toHaveValue('@eve')
    await page.setViewportSize({ width: 390, height: 844 })
    await input.fill('@ever')
    await page.getByRole('option').click()
    await expect(input).toHaveValue('@everyone ')
    await input.fill('Shared composer QA')
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
    await expect(input).toHaveValue('Shared composer QA')
    await input.press('Enter')
    await expect(page.locator('[id^="msg-"]').filter({ hasText: 'Shared composer QA' })).toBeVisible()
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})

test('shared channel fields create and edit a real forum on desktop and fit on mobile', async ({ page, request }) => {
  test.setTimeout(90_000)
  page.setDefaultTimeout(10_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    await openServer(page, server)
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
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const updated = await apiCall(page, 'get', '/api/servers/' + server.id + '/channels')
    expect(updated.find((channel: { id: string }) => channel.id === forum.id).postGuidelines).toBe(
      'Updated shared guidelines'
    )
    await channel.click({ button: 'right' })
    await page.getByRole('menu').locator('[data-menu-control="edit"]').click()
    await page.locator('#edit-forum-guidelines').fill('Unsaved responsive draft')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('#edit-forum-guidelines')).toHaveValue('Unsaved responsive draft')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Discard and close', exact: true }).click()
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
    await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
    await page.getByRole('button', { name: 'general', exact: true }).last().click()
    const general = channels.find(
      (channel: { name: string; type: string }) => channel.name === 'general' && channel.type === 'text'
    )
    await expect(page).toHaveURL(new RegExp('/channels/' + server.id + '/' + general.id))
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})
