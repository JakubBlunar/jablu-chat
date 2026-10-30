import { test, expect, type Page } from '@playwright/test'
import type { Channel, Message } from '@chat/shared'
import { loginAs, createTestServer, apiCall } from './helpers'

// Real local API + Docker PostgreSQL/Redis. Only response timing/failures are
// intercepted; successful message bodies always come from the local API.
test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

let page: Page
let servers: string[] = []
let first: Channel
let second: Channel
let other: Channel
let forum: Channel
let messages: Message[]
let otherMessage: Message
let secondMessage: Message
let threadReply: Message
let post: Message
let forumReply: Message
let reply: Message
let dmId: string
let dmMessage: Message

async function jump(channel: Channel, message?: Message, thread?: string) {
  const query = new URLSearchParams()
  if (message) query.set('m', message.id)
  if (thread) query.set('thread', thread)
  await page.evaluate(async (path) => {
    const modulePath = '/src/lib/notificationNavigation.ts'
    const { navigateFromNotification } = await import(modulePath)
    navigateFromNotification(path)
  }, `/channels/${channel.serverId}/${channel.id}${query.size ? `?${query}` : ''}`)
}

async function visible(message: Message) {
  await expect(page.locator(`#msg-${message.id}`)).toBeVisible()
  await expect(page.locator('[role="log"].invisible')).toHaveCount(0)
}

async function clearReader() {
  await page.evaluate(async () => {
    const modulePath = '/src/stores/inbox.store.ts'
    const { useInboxStore } = await import(modulePath)
    useInboxStore.setState({ reader: null, open: false })
  })
}

async function sendThread(channelId: string, parentId: string): Promise<Message> {
  return page.evaluate(async ({ channelId, parentId }) => {
    const modulePath = '/src/lib/socket.ts'
    const { getSocket } = await import(modulePath)
    const result = await getSocket().timeout(10_000).emitWithAck('message:send', {
      channelId, threadParentId: parentId, content: 'Reply regression target', clientMessageId: crypto.randomUUID()
    })
    if (!result.message) throw new Error(JSON.stringify(result))
    return result.message
  }, { channelId, parentId })
}

test.beforeAll(async ({ browser, request }) => {
  page = await browser.newPage()
  page.setDefaultTimeout(10_000)
  await loginAs(page, 'admin')
  await page.evaluate(async () => {
    const modulePath = '/src/i18n/config.ts'
    const { i18n } = await import(modulePath)
    await i18n.changeLanguage('en')
  })
  for (let index = 0; index < 2; index++) {
    const server = await createTestServer(page, request)
    servers.push(server.id)
  }
  const channels = await apiCall(page, 'get', `/api/servers/${servers[0]}/channels`) as Channel[]
  first = channels.find((channel) => channel.type === 'text')!
  expect(first).toBeTruthy()
  second = await apiCall(page, 'post', `/api/servers/${servers[0]}/channels`, { name: 'navigation-second', type: 'text' })
  forum = await apiCall(page, 'post', `/api/servers/${servers[0]}/channels`, { name: 'navigation-forum', type: 'forum' })
  const otherChannels = await apiCall(page, 'get', `/api/servers/${servers[1]}/channels`) as Channel[]
  other = otherChannels.find((channel) => channel.type === 'text')!
  messages = []
  for (let index = 0; index < 6; index++) {
    messages.push(await apiCall(page, 'post', `/api/channels/${first.id}/messages`, { content: `Navigation regression ${index}` }))
  }
  secondMessage = await apiCall(page, 'post', `/api/channels/${second.id}/messages`, { content: 'Second channel regression target' })
  otherMessage = await apiCall(page, 'post', `/api/channels/${other.id}/messages`, { content: 'Other server regression target' })
  threadReply = await sendThread(first.id, messages[0].id)
  post = await apiCall(page, 'post', `/api/channels/${forum.id}/posts`, { title: 'Navigation post', content: 'Forum parent target' })
  forumReply = await sendThread(forum.id, post.id)
  reply = await apiCall(page, 'post', `/api/channels/${first.id}/messages`, { content: 'Reply preview regression', replyToId: messages[0].id })
  await apiCall(page, 'post', `/api/channels/${first.id}/messages/${messages[0].id}/pin`)
  await apiCall(page, 'post', '/api/bookmarks', { messageId: otherMessage.id })
  // Read an existing seeded test DM; this test sends nothing to its participant.
  const conversations = await apiCall(page, 'getDmConversations')
  for (const conversation of conversations) {
    const history = await apiCall(page, 'getDmMessages', conversation.id)
    if (history.messages.length) {
      dmId = conversation.id
      dmMessage = history.messages[0]
      break
    }
  }
  expect(dmMessage).toBeTruthy()
  await page.evaluate(async () => {
    const modulePath = '/src/stores/server.store.ts'
    const { useServerStore } = await import(modulePath)
    await useServerStore.getState().fetchServers()
  })
})

test.afterAll(async () => {
  if (page) {
    for (const serverId of servers) await apiCall(page, 'delete', `/api/servers/${serverId}`).catch(() => {})
    await page.close()
  }
})

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test.describe(viewport.name, () => {
    test.beforeEach(async () => {
      await page.setViewportSize(viewport)
      await page.evaluate(async () => {
        const stores = '/src/stores/'
        const { useAuthStore } = await import(stores + 'auth.store.ts')
        useAuthStore.setState((state) => ({ user: { ...state.user, locale: 'en' } }))
        const modulePath = '/src/i18n/config.ts'
        const { i18n } = await import(modulePath)
        await i18n.changeLanguage('en')
      })
      await clearReader()
      const closeSearch = page.getByRole('button', { name: 'Close search', exact: true }).first()
      if (await closeSearch.isVisible()) await closeSearch.click()
      await jump(first, messages[0])
      await visible(messages[0])
      await expect(page).not.toHaveURL(/[?&]m=/)
      await expect.poll(() => page.evaluate(async () => {
        const stores = '/src/stores/'
        const [{ useNavigationStore }, { useMessageStore }] = await Promise.all([
          import(stores + 'navigation.store.ts'), import(stores + 'message.store.ts')
        ])
        return { navigating: useNavigationStore.getState().isNavigating, loaded: useMessageStore.getState().loadedForChannelId }
      })).toEqual({ navigating: false, loaded: first.id })
    })

    test('cold launch restores the last channel from persisted history', async () => {
      await page.goto('/')
      await expect(page).toHaveURL(new RegExp(`/channels/${first.serverId}/${first.id}$`))
      await visible(messages[0])
    })

    test('cold launch restores a DM or the friends list without selecting a channel', async () => {
      await page.evaluate(async (dmId) => {
        const modulePath = '/src/lib/notificationNavigation.ts'
        const { navigateFromNotification } = await import(modulePath)
        navigateFromNotification(`/channels/@me/${dmId}`)
      }, dmId)
      await visible(dmMessage)
      await page.goto('/')
      await expect(page).toHaveURL(new RegExp(`/channels/@me/${dmId}$`))
      await visible(dmMessage)

      const outcome = await page.evaluate(async () => {
        const modulePath = '/src/lib/conversationNavigation.ts'
        const { openConversation } = await import(modulePath)
        return openConversation({ target: { kind: 'home' } })
      })
      expect(outcome.status).toBe('opened')
      await expect(page).toHaveURL(/\/channels\/@me$/)
      await page.goto('/')
      await expect(page).toHaveURL(/\/channels\/@me$/)
    })

    test('same-channel, repeated, cross-channel and cross-server notification jumps', async () => {
      for (const [channel, message] of [[first, messages[4]], [first, messages[4]], [second, secondMessage], [other, otherMessage], [first, messages[0]]] as const) {
        await jump(channel, message)
        await visible(message)
        await expect(page).not.toHaveURL(/[?&]m=/)
      }
    })

    test('DM jumps and switching back to server history', async () => {
      for (let index = 0; index < 2; index++) {
        await page.evaluate(async ({ dmId, messageId }) => {
          const modulePath = '/src/lib/notificationNavigation.ts'
          const { navigateFromNotification } = await import(modulePath)
          navigateFromNotification(`/channels/@me/${dmId}?m=${messageId}`)
        }, { dmId, messageId: dmMessage.id })
        await visible(dmMessage)
        await jump(other, otherMessage)
        await visible(otherMessage)
      }
    })

    test('ordinary sidebar switches load a channel and its cached return', async () => {
      for (const [channel, message] of [[second, secondMessage], [first, messages[0]]] as const) {
        if (viewport.name === 'phone') await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
        const sidebar = viewport.name === 'phone' ? page.getByRole('dialog') : page.locator('aside')
        await sidebar.getByRole('button', { name: channel.name, exact: true }).click()
        await visible(message)
      }
    })

    test('the unread marker can be opened without hiding history', async () => {
      await page.route('**/api/read-states', async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        body.channels = body.channels.filter((entry: { channelId: string }) => entry.channelId !== first.id)
        body.channels.push({ channelId: first.id, serverId: first.serverId, unreadCount: 1, mentionCount: 0,
          firstUnreadMessageId: messages[5].id, lastReadAt: messages[0].createdAt })
        await route.fulfill({ response, json: body })
      })
      await page.evaluate(async ({ channelId, messageId }) => {
        // Keep the normal 250ms read acknowledgement from clearing this
        // controlled unread fixture before its marker is exercised.
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
        const modulePath = '/src/stores/readState.store.ts'
        const { useReadStateStore } = await import(modulePath)
        await useReadStateStore.getState().fetchAll()
        const unread = { unreadCount: 1, mentionCount: 0, firstUnreadMessageId: messageId, lastReadAt: new Date().toISOString() }
        useReadStateStore.setState((state) => ({
          channels: new Map(state.channels).set(channelId, unread),
          channelViewSnapshots: new Map(state.channelViewSnapshots).set(channelId, unread)
        }))
      }, { channelId: first.id, messageId: messages[5].id })
      try {
        await page.getByTestId('new-messages-pill').click()
        await visible(messages[5])
        await expect(page.locator(`#msg-${messages[5].id}`)).toHaveClass(/bg-primary\/10/)
      } finally {
        await page.unroute('**/api/read-states')
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
          document.dispatchEvent(new Event('visibilitychange'))
        })
      }
    })

    test('reply previews and search results jump through the shared history', async () => {
      await jump(first, reply)
      await visible(reply)
      await page.locator(`#msg-${reply.id}`).getByRole('button', { name: 'Jump to message', exact: true }).click()
      await visible(messages[0])
      if (viewport.name === 'phone') await page.getByRole('button', { name: 'Search', exact: true }).click()
      const input = page.getByPlaceholder('Search…').last()
      await input.fill('Navigation regression 2')
      await input.press('Enter')
      await page.getByRole('button').filter({ has: page.getByText('Navigation regression 2', { exact: true }) }).first().click()
      await visible(messages[2])
    })

    test('saved messages navigate across servers', async () => {
      const inbox = page.getByRole('button', { name: 'Saved messages', exact: true }).first()
      if (viewport.name === 'phone') await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
      await inbox.click()
      const dialog = page.getByRole('dialog', { name: 'Saved messages', exact: true })
      await dialog.locator('[class~="group/bm"]').filter({ hasText: otherMessage.content }).getByRole('button', { name: 'Jump to message', exact: true }).click()
      await visible(otherMessage)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })

    test('pinned messages jump without hiding the channel', async () => {
      if (viewport.name === 'phone') {
        await page.getByRole('button', { name: first.name, exact: true }).click()
        await page.getByRole('button', { name: /^Pins/ }).click()
      } else {
        await page.getByRole('button', { name: 'Pinned Messages', exact: true }).click()
      }
      await page.locator('[class~="group/pin"]').filter({ hasText: messages[0].content }).getByRole('button', { name: 'Jump to message', exact: true }).click()
      await visible(messages[0])
      const close = page.getByRole('button', { name: 'Close', exact: true }).last()
      if (await close.isVisible()) await close.click()
    })

    test('resume and reconnect followed by a different-server jump', async () => {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await page.context().setOffline(true)
      await page.context().setOffline(false)
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await jump(other, otherMessage)
      await visible(otherMessage)
    })

    test('inbox jump during a delayed initial unread load', async () => {
      await page.route(`**/api/channels/${other.id}/messages?**`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 350))
        await route.continue()
      })
      await page.evaluate(async ({ channel, target }) => {
        const stores = '/src/stores/'
        const [{ useReadStateStore }, { useMessageStore }, { useInboxStore }] = await Promise.all([
          import(stores + 'readState.store.ts'), import(stores + 'message.store.ts'), import(stores + 'inbox.store.ts')
        ])
        await useInboxStore.getState().fetchPage()
        useMessageStore.getState().clearMessages()
        useReadStateStore.setState((state) => ({ channels: new Map(state.channels).set(channel.id, {
          unreadCount: 1, mentionCount: 0, firstUnreadMessageId: target.id, lastReadAt: null
        }) }))
        useInboxStore.getState().read({
          key: `channel:${channel.id}`, target: { mode: 'channel', serverId: channel.serverId, contextId: channel.id, messageId: target.id, threadParentId: null },
          name: channel.name, unreadCount: 1, mentionCount: 0, replyCount: 0, highlights: [], latestAt: target.createdAt
        })
      }, { channel: other, target: otherMessage })
      await visible(otherMessage)
      await page.unrouteAll({ behavior: 'wait' })
    })

    test('a slow obsolete jump cannot replace a newer channel', async () => {
      let release!: () => void
      let intercepted = 0
      const gate = new Promise<void>((resolve) => { release = resolve })
      await page.route(`**/api/channels/${second.id}/messages?**`, async (route) => {
        intercepted++
        await gate
        await route.continue()
      })
      try {
        await jump(second, secondMessage)
        await expect.poll(() => intercepted).toBeGreaterThan(0)
        await jump(other, otherMessage)
        await visible(otherMessage)
        release()
        await expect.poll(async () => page.evaluate(async () => {
          const modulePath = '/src/stores/message.store.ts'
          const { useMessageStore } = await import(modulePath)
          return useMessageStore.getState().isLoading
        })).toBe(false)
        await visible(otherMessage)
        await expect(page).toHaveURL(new RegExp(other.id))
      } finally {
        release()
        await page.unrouteAll({ behavior: 'wait' })
      }
    })

    test('returning to the current channel cancels a pending message preload', async () => {
      let release!: () => void
      let intercepted = false
      const gate = new Promise<void>((resolve) => { release = resolve })
      await page.route(`**/api/channels/${second.id}/messages?**`, async (route) => {
        intercepted = true
        await gate
        await route.continue()
      })
      try {
        await page.evaluate(async ({ serverId, channelId, messageId }) => {
          const modulePath = '/src/lib/conversationNavigation.ts'
          const { openConversation } = await import(modulePath)
          void openConversation({ target: { kind: 'channel', serverId, channelId }, position: { kind: 'message', messageId } })
        }, { serverId: second.serverId, channelId: second.id, messageId: secondMessage.id })
        await expect.poll(() => intercepted).toBe(true)
        await jump(first, messages[0])
        await expect(page).not.toHaveURL(/[?&]m=/)
        release()
        await page.unrouteAll({ behavior: 'wait' })
        await visible(messages[0])
        await expect(page).toHaveURL(new RegExp(first.id))
      } finally {
        release()
        await page.unrouteAll({ behavior: 'wait' })
      }
    })

    test('failed jump reveals its error and retry recovers', async () => {
      await page.evaluate(async channelId => {
        const modulePath = '/src/lib/cache/messageCache.ts'
        const { evictContext, channelKey } = await import(modulePath)
        evictContext(channelKey(channelId))
        const dbPath = '/src/lib/cache/db.ts'
        const { deleteMessages } = await import(dbPath)
        await deleteMessages(channelKey(channelId))
      }, second.id)
      await page.route(`**/api/channels/${second.id}/messages?**`, (route) => route.fulfill({ status: 503, json: { message: 'Regression offline' } }))
      await jump(second, secondMessage)
      await expect(page.getByRole('alert').first()).toBeVisible()
      await expect(page.locator('[role="log"].invisible')).toHaveCount(0)
      await page.unrouteAll({ behavior: 'wait' })
      await page.getByRole('button', { name: 'Retry', exact: true }).first().click()
      await visible(secondMessage)
    })

    test('thread and forum reply deep links load and remain visible', async () => {
      await jump(first, threadReply, messages[0].id)
      await visible(threadReply)
      await jump(forum, forumReply, post.id)
      await visible(forumReply)
      await jump(first, messages[2])
      await visible(messages[2])
    })

    test('cold reload and browser back/forward restore usable histories', async () => {
      await page.goto(`/channels/${other.serverId}/${other.id}?m=${otherMessage.id}`)
      await visible(otherMessage)
      await page.reload()
      await visible(otherMessage)
      await jump(first, messages[1])
      await visible(messages[1])
      await jump(second, secondMessage)
      await visible(secondMessage)
      await page.goBack()
      await visible(messages[1])
      await page.goForward()
      await visible(secondMessage)
    })
  })
}
