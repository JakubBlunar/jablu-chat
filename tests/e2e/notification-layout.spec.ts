import { test, expect } from '@playwright/test'

test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173' })

// Synthetic account and messages: this regression needs only the Vite server.
test('desktop title-bar actions and notification jumps preserve the frame and panels', async ({ page }) => {
  await page.setViewportSize({ width: 1292, height: 856 })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string) => {
          if (command === 'get_version') return 'test'
          if (command === 'get_platform') return 'win32'
          if (command === 'plugin:event|listen') return 1
          if (command === 'get_window_state') return { visible: true, minimized: false, focused: true }
          if (command === 'get_update_status') return { feedConfigured: false, pendingVersion: null }
          return null
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} }
    })
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    const json = path.endsWith('/ids') ? { ids: [] }
      : path.includes('/auth/') ? null
      : path.includes('permissions') ? {}
      : path.includes('/inbox') ? { session: null, groups: [], counts: {}, snapshotAt: new Date().toISOString() }
      : path.includes('/unread') ? { count: 0 }
      : path.includes('/gif') ? { enabled: false } : []
    await route.fulfill({ json, status: path.includes('/auth/') ? 401 : 200 })
  })
  await page.goto('/#/login')
  await expect(page.locator('input[type=email]')).toBeVisible()
  await page.evaluate(async () => {
    const stores = '/src/stores/'
    const [{ useAuthStore }, { useServerStore }, { useChannelStore }, { useMessageStore }, factory, { api }] = await Promise.all([
      import(stores + 'auth.store.ts'), import(stores + 'server.store.ts'), import(stores + 'channel.store.ts'),
      import(stores + 'message.store.ts'), import('/src/test/' + 'factories.ts'), import('/src/lib/api/' + 'index.ts')
    ])
    api.get = async (path: string) => path.includes('messages') ? { messages: [], hasMore: false }
      : path.includes('/bookmarks') ? { bookmarks: [], hasMore: false }
      : path.includes('/inbox') ? { session: null, groups: [], counts: {}, snapshotAt: new Date().toISOString() }
      : path.includes('/events') ? { events: [], hasMore: false } : []
    api.onAuthFailure = null
    useServerStore.setState({ servers: [factory.makeServer('s1')], currentServerId: 's1', viewMode: 'server', isLoading: false, fetchServers: async () => {} })
    useChannelStore.setState({ channels: [factory.makeChannel('ch1', 's1')], currentChannelId: 'ch1', loadedServerId: 's1', isLoading: false, fetchChannels: async () => {} })
    const messages = Array.from({ length: 50 }, (_, index) => factory.makeMessage({
      id: `message-${index}`, channelId: 'ch1', content: `Test message ${index}: ` + 'Notification geometry check. '.repeat(6)
    }))
    useMessageStore.setState({ messages, loadedForChannelId: 'ch1', isLoading: false, hasMore: false, hasNewer: false })
    useAuthStore.setState({ user: { id: 'me', username: 'Tester', displayName: null, avatarUrl: null, locale: 'en' }, isAuthenticated: true, isLoading: false, accessToken: 'synthetic-token' })
  })
  await expect(page.locator('#main-content textarea')).toBeVisible()
  // Model tauri-plugin-frame's body-level overlay. A fixed app wrapper creates
  // a stacking context that can trap title-bar actions below this drag region.
  await page.evaluate(() => {
    const frame = document.createElement('div')
    frame.setAttribute('data-tauri-frame-tb', '')
    Object.assign(frame.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '32px',
      zIndex: '100', display: 'flex', alignItems: 'end', justifyContent: 'end'
    })
    const drag = document.createElement('div')
    drag.setAttribute('data-tauri-drag-region', '')
    Object.assign(drag.style, { width: '100%', height: '100%' })
    frame.appendChild(drag)
    for (const name of ['minimize', 'maximize', 'close']) {
      const button = document.createElement('button')
      button.id = `frame-tb-${name}`
      Object.assign(button.style, { width: '46px', height: '32px', flexShrink: '0' })
      button.addEventListener('click', () => { button.dataset.clicked = 'true' })
      frame.appendChild(button)
    }
    document.documentElement.style.setProperty('--tauri-frame-controls-width', '138px')
    document.body.prepend(frame)
  })
  const saved = page.getByRole('button', { name: 'Saved messages', exact: true })
  await saved.click({ timeout: 5000 })
  await expect(page.getByRole('dialog', { name: 'Saved messages', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(saved).toHaveAttribute('aria-expanded', 'false')
  const inbox = page.getByRole('button', { name: 'Inbox', exact: true })
  await inbox.click()
  await expect(page.getByRole('dialog', { name: 'Inbox', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(inbox).toHaveAttribute('aria-expanded', 'false')
  for (const name of ['minimize', 'maximize', 'close']) {
    const button = page.locator(`#frame-tb-${name}`)
    await button.click()
    await expect(button).toHaveAttribute('data-clicked', 'true')
  }
  expect(await page.evaluate(() =>
    document.elementFromPoint(innerWidth / 2, 16)?.hasAttribute('data-tauri-drag-region')
  )).toBe(true)
  const snapshot = () => page.evaluate(() => {
    const content = document.getElementById('main-content')!
    const layout = content.parentElement!.parentElement!
    const composer = content.querySelector('[data-message-composer]')!
    return { top: content.getBoundingClientRect().top, bottom: composer.getBoundingClientRect().bottom, scrollTop: layout.scrollTop, height: innerHeight }
  })
  const before = await snapshot()
  expect(before.top).toBe(32)
  expect(before.bottom).toBe(before.height)
  for (const target of ['message-48', 'message-20', 'message-48']) {
    await page.evaluate(async (messageId) => {
      document.querySelector('textarea')?.focus()
      const modulePath = '/src/lib/notificationNavigation.ts'
      const { navigateFromNotification } = await import(modulePath)
      // Keep a visit marker after the jump hook consumes the message parameter,
      // so Back/Forward can assert which history entry the router restored.
      navigateFromNotification(`/channels/s1/ch1?visit=${messageId}&m=${messageId}`)
    }, target)
    await expect(page.locator(`#msg-${target}`)).toHaveClass(/bg-primary\/10/)
    await expect(page).toHaveURL(new RegExp(`visit=${target}$`))
    await expect.poll(snapshot).toEqual(before)
  }
  const back = page.getByRole('button', { name: 'Back', exact: true })
  const forward = page.getByRole('button', { name: 'Forward', exact: true })
  await expect(back).toBeEnabled()
  await back.click()
  await expect(page).toHaveURL(/visit=message-20$/)
  await expect.poll(snapshot).toEqual(before)
  await expect(forward).toBeEnabled()
  await forward.click()
  await expect(page).toHaveURL(/visit=message-48$/)
  await expect(forward).toBeDisabled()
  await expect.poll(snapshot).toEqual(before)
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.setViewportSize({ width: 1292, height: 856 })
  await expect.poll(snapshot).toEqual(before)
  // Even a browser-driven reveal must not scroll the outer app layout.
  await page.locator('#msg-message-48').evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect.poll(snapshot).toEqual(before)
})
