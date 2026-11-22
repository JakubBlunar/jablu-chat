import { expect, test } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

test('cold channel and reply authors keep their role color while the server roster is delayed', async ({
  page,
  request
}) => {
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    const channel = server.channels.find((c: { type: string }) => c.type === 'text')
    const path = '/api/channels/' + channel.id + '/messages'
    const first = await apiCall(page, 'post', path, { content: 'Colored author' })
    const reply = await apiCall(page, 'post', path, { content: 'Colored reply', replyToId: first.id })
    const roster = await apiCall(page, 'get', '/api/servers/' + server.id + '/roster')
    const owner = roster.members.find((m: { userId: string }) => m.userId === first.authorId)
    const color = roster.roles
      .filter((r: { id: string; color: string }) => r.color && owner.roleIds.includes(r.id))
      .sort((a: { position: number }, b: { position: number }) => b.position - a.position)[0].color
    const matcher = (url: URL) => url.pathname === '/api/servers/' + server.id + '/roster'
    await page.route(matcher, async (route) => {
      await gate
      await route.continue()
    })
    const pending = page.waitForRequest((req) => matcher(new URL(req.url())))
    await page.goto('/channels/' + server.id + '/' + channel.id)
    await pending
    const authors = page.locator('#msg-' + reply.id + ' button[style*="color-mix"]')
    await expect(authors).toHaveCount(2)
    const paint = () => authors.evaluateAll((elements) => elements.map((el) => getComputedStyle(el).color))
    const before = await paint()
    const expected = await page.evaluate((color) => {
      const el = document.createElement('span')
      el.style.color = 'color-mix(in srgb, ' + color + ' var(--role-color-share, 100%), #101828)'
      document.body.append(el)
      const painted = getComputedStyle(el).color
      el.remove()
      return painted
    }, color)
    expect(before).toEqual([expected, expected])
    release()
    await expect
      .poll(() =>
        page.evaluate(async (serverId) => {
          const path = '/src/stores/member.store.ts'
          return (await import(path)).useMemberStore.getState().rosterServerId === serverId
        }, server.id)
      )
      .toBe(true)
    expect(await paint()).toEqual(before)
  } finally {
    release()
    await apiCall(page, 'deleteServer', server.id)
  }
})
