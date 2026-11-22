import { expect, test, type Page } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

async function useEnglish(page: Page) {
  await expect(page.locator('main, #main-content').first()).toBeVisible()
  await page.evaluate(async () => {
    const auth = '/src/stores/auth.store.ts'
    const { useAuthStore } = await import(auth)
    useAuthStore.setState((s: { user: object }) => ({ user: { ...s.user, locale: 'en' } }))
    const config = '/src/i18n/config.ts'
    const { i18n } = await import(config)
    await i18n.changeLanguage('en')
  })
}

const nextPaint = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )

test('composer geometry, reading position, keyboard reply and recent switcher survive a channel round trip', async ({
  page,
  request
}) => {
  test.setTimeout(90_000)
  page.setDefaultTimeout(8_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const first = server.channels.find((c: { type: string }) => c.type === 'text')
    const second = await apiCall(page, 'post', '/api/servers/' + server.id + '/channels', {
      name: 'ux-second',
      type: 'text'
    })
    for (let i = 0; i < 8; i++) {
      await apiCall(page, 'post', '/api/channels/' + first.id + '/messages', {
        content: 'Reading paragraph ' + i + '\n' + 'A sample line of text.\n'.repeat(8)
      })
    }
    await page.goto('/channels/' + server.id + '/' + first.id)
    await useEnglish(page)
    const log = page.locator('.chat-scroll[role=log]')
    const input = page.locator('.chat-composer textarea')
    await expect(log.locator('[data-message-window]')).toHaveCount(8)
    for (const gap of [0, 29, 32, 100]) {
      await log.evaluate((el, gap) => {
        el.scrollTop = el.scrollHeight - el.clientHeight - gap
      }, gap)
      await nextPaint(page)
      const geometry = () =>
        log.evaluate((el) => [el.getBoundingClientRect().bottom, el.lastElementChild!.getBoundingClientRect().bottom])
      const before = await geometry()
      await input.focus()
      await nextPaint(page)
      expect(await geometry()).toEqual(before)
      await input.blur()
      await nextPaint(page)
      expect(await geometry()).toEqual(before)
    }
    await input.fill('selected words')
    await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 8))
    await page.getByRole('button', { name: 'Format text' }).click()
    await page.locator('.chat-composer button[title*="spoiler" i]').click()
    await expect(input).toHaveValue('||selected|| words')
    await input.press('Escape')
    await expect(input).toBeFocused()
    await input.fill('')
    await log.evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight - 360
    })
    await nextPaint(page)
    const firstRow = () =>
      log.evaluate((el) => {
        const top = el.getBoundingClientRect().top
        const row = [...el.querySelectorAll('[data-message-window]')].find(
          (row) => row.getBoundingClientRect().bottom > top + 10
        )!
        return row ? { id: row.id, offset: Math.round(row.getBoundingClientRect().top - top) } : null
      })
    const point = await firstRow()
    expect(point).not.toBeNull()
    await page.getByText(second.name, { exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(second.id + '$'))
    await page.keyboard.press('Control+k')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(first.id + '$'))
    await expect.poll(firstRow).toEqual(point)
    await expect(log).toBeVisible()
    await log.press('ArrowDown')
    await expect(log.locator('[data-keyboard-message]:focus')).toHaveCount(1)
    await page.keyboard.press('r')
    await expect(input).toBeFocused()
    await expect(page.getByText(/replying to/i).first()).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await input.focus()
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 450 })
      window.visualViewport!.dispatchEvent(new Event('resize'))
    })
    const files = Array.from({ length: 20 }, (_, i) => ({
      name: 'note-' + i + '.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('draft')
    }))
    const tray = page.locator('[role=list]').filter({ has: page.getByText('note-0.txt', { exact: true }) })
    const picker = page.locator('.chat-composer input[type=file]')
    let staged = 0
    for (const count of [1, 6, 20]) {
      await picker.setInputFiles(files.slice(staged, count))
      await expect(tray.getByRole('button')).toHaveCount(count)
      expect((await log.boundingBox())!.height).toBeGreaterThan(44)
      staged = count
    }
    await input.fill('Draft line\n'.repeat(14))
    const send = page.getByRole('button', { name: 'Send message', exact: true })
    expect((await send.boundingBox())!.y + (await send.boundingBox())!.height).toBeLessThanOrEqual(450)
    expect((await log.boundingBox())!.height).toBeGreaterThan(44)
    expect(await tray.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await tray.getByRole('button').nth(10).click()
    await expect(tray.getByRole('button')).toHaveCount(19)
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})

test('forum filters search the complete collection and mobile settings preserve a filtered place', async ({
  page,
  request
}) => {
  page.setDefaultTimeout(8_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const forum = await apiCall(page, 'post', '/api/servers/' + server.id + '/channels', {
      type: 'forum',
      name: 'ux-forum'
    })
    const base = '/api/channels/' + forum.id
    const tags = []
    for (let i = 0; i < 9; i++)
      tags.push(await apiCall(page, 'post', base + '/tags', { name: 'Tag ' + i, color: '#667788' }))
    await apiCall(page, 'post', base + '/posts', {
      title: 'Earlier searchable post',
      content: 'needle',
      tagIds: [tags[0].id, tags[8].id]
    })
    await apiCall(page, 'post', base + '/posts', { title: 'Later post', content: 'needle', tagIds: [tags[0].id] })
    const unfiltered = await apiCall(page, 'get', base + '/posts?sort=newest&limit=1')
    expect(unfiltered.posts[0].title).toBe('Later post')
    const both = await apiCall(
      page,
      'get',
      base + '/posts?sort=newest&limit=1&q=needle&tagIds=' + [tags[0].id, tags[8].id].join(',')
    )
    expect(both.posts.map((p: { title: string }) => p.title)).toEqual(['Earlier searchable post'])
    await page.goto('/channels/' + server.id + '/' + forum.id)
    await useEnglish(page)
    const query = page.getByPlaceholder(/search posts/i)
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.getByRole('button', { name: 'Tag 8', exact: true }).click()
    await page.getByRole('button', { name: 'Tag 0', exact: true }).click()
    await expect(page.getByText('Earlier searchable post', { exact: true })).toBeVisible()
    await expect(page.getByText('Later post', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear all', exact: true }).click()
    await query.fill('missing result')
    await expect(page.getByText('No matching posts', { exact: false })).toBeVisible()
    await page.route(
      '**/posts?**q=Earlier*',
      (route) => route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
      { times: 1 }
    )
    await query.fill('Earlier searchable')
    await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Earlier searchable post', { exact: true })).toBeVisible()
    await expect(page.getByText('Later post', { exact: true })).toHaveCount(0)
    await page.setViewportSize({ width: 360, height: 720 })
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    await page.locator('button[aria-haspopup=menu]:not([title])').first().click()
    await page.getByRole('menu').locator('[data-menu-control=settings]').click()
    const dialog = page.getByRole('dialog', { name: 'Server Settings' })
    const find = dialog.getByRole('searchbox')
    await find.fill('audit')
    const row = dialog.getByRole('button', { name: 'Audit Log', exact: true })
    await row.click()
    await expect(dialog.getByRole('heading', { name: 'Audit Log' }).first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(row).toBeFocused()
    await expect(find).toHaveValue('audit')
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})

test('phone swipe, drawer direction and return to a search result', async ({ page, request }) => {
  page.setDefaultTimeout(8_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const channel = server.channels.find((c: { type: string }) => c.type === 'text')
    const msg = await apiCall(page, 'post', '/api/channels/' + channel.id + '/messages', {
      content: 'phone search marker'
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/channels/' + server.id + '/' + channel.id)
    await useEnglish(page)
    const row = page.locator('#msg-' + msg.id + ' [data-keyboard-message]').first()
    await expect(row).toBeVisible()
    const swipe = async (target: typeof row, dx: number, dy: number) => {
      await target.evaluate(
        (el, { dx, dy }) => {
          const start = new Touch({ target: el, identifier: 1, clientX: 185, clientY: 180 })
          const end = new Touch({ target: el, identifier: 1, clientX: 185 + dx, clientY: 180 + dy })
          el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }))
          el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [end] }))
          el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [end] }))
        },
        { dx, dy }
      )
    }
    await swipe(row, -24, 3)
    await expect(page.getByText(/replying to/i)).toHaveCount(0)
    await swipe(row, -90, 7)
    await expect(page.getByText(/replying to/i).first()).toBeVisible()
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    const dialog = page.getByRole('dialog').last()
    const header = dialog.getByText(channel.name, { exact: true }).first()
    await swipe(header, -82, 110)
    await expect(dialog).toBeVisible()
    await swipe(header, -95, 4)
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const search = page.getByRole('dialog').getByRole('textbox').first()
    await search.fill('phone search marker')
    await search.press('Enter')
    await page.locator('[data-result-id="' + msg.id + '"]').click()
    const back = page.getByRole('button', { name: /Back to results/ })
    await expect(back).toBeVisible()
    await back.click()
    const restored = page.locator('[data-result-id="' + msg.id + '"]')
    await expect(restored).toBeFocused()
    await expect(page.getByRole('dialog').getByRole('textbox').first()).toHaveValue('phone search marker')
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})

test('a member-panel drag writes its final width once and a stale GIF cannot replace the query', async ({
  page,
  request
}) => {
  page.setDefaultTimeout(8_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const channel = server.channels.find((c: { type: string }) => c.type === 'text')
    await page.route('**/api/gif/enabled', (route) => route.fulfill({ json: { enabled: true } }))
    const gif = (title: string) => ({
      results: [{ id: title, title, url: '/favicon.svg', preview: '/favicon.svg', width: 30, height: 30 }],
      next: ''
    })
    await page.route('**/api/gif/trending*', (route) => route.fulfill({ json: gif('trending') }))
    let release!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/gif/search*', async (route) => {
      const q = new URL(route.request().url()).searchParams.get('q')!
      if (q === 'cats') await waiting
      await route.fulfill({ json: gif(q) })
    })
    await page.goto('/channels/' + server.id + '/' + channel.id)
    await useEnglish(page)
    const divider = page.getByRole('separator', { name: 'Resize member list' })
    await expect(divider).toBeVisible()
    const bounds = (await divider.boundingBox())!
    await page.evaluate(() => {
      const original = Storage.prototype.setItem
      document.body.dataset.widthWrites = '0'
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jablu-settings')
          document.body.dataset.widthWrites = String(Number(document.body.dataset.widthWrites) + 1)
        return original.call(this, key, value)
      }
    })
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 70, y, { steps: 30 })
    expect(await page.locator('body').getAttribute('data-width-writes')).toBe('0')
    await page.mouse.up()
    expect(await page.locator('body').getAttribute('data-width-writes')).toBe('1')
    await page.getByRole('button', { name: 'GIF picker' }).click()
    const input = page.getByPlaceholder(/giphy/i)
    const old = page.waitForRequest((r) => r.url().includes('/api/gif/search?') && r.url().includes('cats'))
    await input.fill('cats')
    await old
    await input.fill('otters')
    await expect(page.getByTitle('otters')).toBeVisible()
    const finished = page.waitForResponse((r) => r.url().includes('/api/gif/search?') && r.url().includes('cats'))
    release()
    await finished
    await nextPaint(page)
    await expect(page.getByTitle('otters')).toBeVisible()
    await expect(page.getByTitle('cats')).toHaveCount(0)
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})

test('cross-channel pins wait for the requested history even on a slow connection', async ({ page, request }) => {
  page.setDefaultTimeout(8_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const first = server.channels.find((c: { type: string }) => c.type === 'text')
    const next = await apiCall(page, 'post', '/api/servers/' + server.id + '/channels', {
      type: 'text',
      name: 'target-pins'
    })
    await page.goto('/channels/' + server.id + '/' + first.id)
    await useEnglish(page)
    const pins: string[] = []
    page.on('request', (r) => {
      const match = new URL(r.url()).pathname.match(/channels\/([^/]+)\/messages\/pinned$/)
      if (match) pins.push(match[1])
    })
    let release!: () => void
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(
      (url) => url.pathname === '/api/channels/' + next.id + '/messages',
      async (route) => {
        await wait
        await route.continue()
      }
    )
    const loading = page.waitForRequest((r) => new URL(r.url()).pathname.endsWith('/' + next.id + '/messages'))
    await page.getByText('target-pins', { exact: true }).click({ button: 'right' })
    await page.getByRole('menu').locator('[data-menu-control=pins]').click()
    await loading
    await nextPaint(page)
    expect(pins).toEqual([])
    release()
    await expect.poll(() => pins).toEqual([next.id])
    await expect(page.getByText('Pinned Messages', { exact: true }).last()).toBeVisible()
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})
