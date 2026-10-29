import { test, expect } from '@playwright/test'

test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173' })

// Synthetic account and messages: this regression needs only the Vite server.
test('notification jumps and restored composer focus keep the desktop panels in place', async ({ page }) => {
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
      navigateFromNotification(`/channels/s1/ch1?m=${messageId}`)
    }, target)
    await expect(page.locator(`#msg-${target}`)).toHaveClass(/bg-primary\/10/)
    await expect.poll(snapshot).toEqual(before)
  }
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.setViewportSize({ width: 1292, height: 856 })
  await expect.poll(snapshot).toEqual(before)
  // Even a browser-driven reveal must not scroll the outer app layout.
  await page.locator('#msg-message-48').evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect.poll(snapshot).toEqual(before)
})
