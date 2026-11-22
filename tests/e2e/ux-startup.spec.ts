import { expect, test } from '@playwright/test'
import { apiCall, createTestServer, loginAs } from './helpers'

// Serve the baseline and candidate production bundles with Vite preview on the two loopback ports.
test('profile a readable channel in cold and warm production builds', async ({ page, browser, request }) => {
  test.skip(process.env.UX_STARTUP_PROFILE !== '1', 'Requires the two local production previews')
  test.setTimeout(300_000)
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  try {
    const channel = server.channels.find((c: { type: string }) => c.type === 'text')
    await apiCall(page, 'post', '/api/channels/' + channel.id + '/messages', { content: 'Startup measurement message' })
    const auth = await page.evaluate(() => localStorage.getItem('chat-auth')!)
    const reports = []
    for (let run = 0; run < 3; run++) {
      for (const locale of ['en', 'sk']) {
        for (const port of run % 2 === 0 ? [5191, 5192] : [5192, 5191]) {
          const origin = 'http://127.0.0.1:' + port
          const context = await browser.newContext({
            locale,
            serviceWorkers: 'block',
            viewport: { width: 1280, height: 800 }
          })
          try {
            await context.addInitScript(
              ({ origin, auth, locale }) => {
                if (location.origin !== origin) return
                localStorage.setItem('chat-auth', auth)
                localStorage.setItem('jablu-settings', JSON.stringify({ state: { locale }, version: 0 }))
                // Fixtures override the locale only in this document. The account preference stays intact.
                const realFetch = window.fetch.bind(window)
                window.fetch = async (...args) => {
                  const response = await realFetch(...args)
                  if (response.ok && new URL(response.url).pathname === '/api/auth/me') {
                    const profile = await response.json()
                    return Response.json({ ...profile, locale })
                  }
                  return response
                }
                const observer = new MutationObserver(() => {
                  const row = document.querySelector<HTMLElement>('.chat-scroll:not(.invisible) [data-message-window]')
                  if (row && row.innerText.includes('Startup measurement message')) {
                    observer.disconnect()
                    requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('first-readable')))
                  }
                })
                observer.observe(document, { childList: true, subtree: true, attributes: true })
              },
              { origin, auth, locale }
            )
            const target = await context.newPage()
            const cdp = await context.newCDPSession(target)
            await cdp.send('Network.enable')
            await cdp.send('Network.emulateNetworkConditions', {
              offline: false,
              latency: 35,
              downloadThroughput: 2_000_000,
              uploadThroughput: 1_000_000
            })
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 })
            for (const cache of ['cold', 'warm']) {
              await target.goto(origin + '/channels/' + server.id + '/' + channel.id, { waitUntil: 'domcontentloaded' })
              await target.waitForFunction(() => !!performance.getEntriesByName('first-readable').length, undefined, {
                timeout: 15_000
              })
              const data = await target.evaluate(() => {
                const at = performance.getEntriesByName('first-readable')[0].startTime
                const assets = performance
                  .getEntriesByType('resource')
                  .map((r) => r as PerformanceResourceTiming)
                  .filter((r) => r.responseEnd <= at && new URL(r.name).pathname.startsWith('/assets/'))
                return {
                  ms: Math.round(at),
                  requests: assets.length,
                  bytes: assets.reduce((sum, r) => sum + r.transferSize, 0),
                  locale: document.documentElement.lang
                }
              })
              expect(data.locale).toBe(locale)
              let inboxMs: number | undefined
              if (cache === 'warm') {
                const button = target
                  .locator('button[aria-haspopup=dialog][aria-expanded][title]')
                  .filter({ visible: true })
                  .first()
                await button.evaluate((el) =>
                  el.addEventListener('click', () => performance.mark('open-inbox'), { once: true })
                )
                await button.click()
                await expect(target.getByRole('dialog').getByRole('tab').first()).toBeVisible()
                inboxMs = await target.evaluate(() =>
                  Math.round(performance.now() - performance.getEntriesByName('open-inbox')[0].startTime)
                )
              }
              reports.push({ run, port, cache, ...data, inboxMs })
            }
          } finally {
            await context.close()
          }
        }
      }
    }
    console.log('Production startup samples', JSON.stringify(reports))
  } finally {
    await apiCall(page, 'deleteServer', server.id)
  }
})

test('installed production worker serves the cached conversation shell after disconnect', async ({
  page,
  browser,
  request
}) => {
  test.skip(process.env.UX_STARTUP_PROFILE !== '1', 'Requires the local candidate preview')
  await loginAs(page, 'admin')
  const server = await createTestServer(page, request)
  const context = await browser.newContext()
  try {
    const channel = server.channels.find((c: { type: string }) => c.type === 'text')
    const content = 'Offline shell check'
    await apiCall(page, 'post', '/api/channels/' + channel.id + '/messages', { content })
    const auth = await page.evaluate(() => localStorage.getItem('chat-auth')!)
    await context.addInitScript((auth) => {
      if (location.origin === 'http://127.0.0.1:5192') localStorage.setItem('chat-auth', auth)
    }, auth)
    const window = await context.newPage()
    await window.goto('http://127.0.0.1:5192/channels/' + server.id + '/' + channel.id)
    await expect(window.locator('.chat-scroll').getByText(content)).toBeVisible()
    await window.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await window.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 })
    await expect
      .poll(() =>
        window.evaluate(
          async ({ serverId, channelId }) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const open = indexedDB.open('jablu-cache')
              open.onsuccess = () => resolve(open.result)
              open.onerror = () => reject(open.error)
            })
            try {
              async function has(store: string, key: string) {
                return new Promise<boolean>((resolve, reject) => {
                  const read = db.transaction(store).objectStore(store).get(key)
                  read.onsuccess = () => resolve(!!read.result)
                  read.onerror = () => reject(read.error)
                })
              }
              return await Promise.all([
                has('messages', 'ch:' + channelId),
                has('structure', 'channels:' + serverId),
                has('structure', 'permissions:' + serverId)
              ])
            } finally {
              db.close()
            }
          },
          { serverId: server.id, channelId: channel.id }
        )
      )
      .toEqual([true, true, true])
    const missing = new Set<string>()
    window.on('requestfailed', (req) => {
      const pathname = new URL(req.url()).pathname
      if (pathname.startsWith('/assets/')) missing.add(pathname)
    })
    await context.setOffline(true)
    await window.reload({ waitUntil: 'domcontentloaded' })
    await expect(window.locator('#main-content'))
      .toBeVisible()
      .catch((error) => {
        throw new Error('Offline shell resources unavailable: ' + [...missing].join(', '), { cause: error })
      })
    await expect(window.locator('.chat-scroll').getByText(content)).toBeVisible()
  } finally {
    await context.close()
    await apiCall(page, 'deleteServer', server.id)
  }
})
