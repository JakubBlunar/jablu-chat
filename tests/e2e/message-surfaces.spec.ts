import { test, expect, type Page } from '@playwright/test'
import { loginAs, sendMessage, waitForMessages } from './helpers'

test.describe('Unified Message Surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test.describe('Text Channel MessageArea', () => {
    test('loads messages and scrolls to bottom on channel switch', async ({ page }) => {
      const channelLinks = page.locator('a[href*="/channels/"]')
      const firstChannel = channelLinks.first()
      if (await firstChannel.isVisible({ timeout: 5_000 })) {
        await firstChannel.click()
        await page.waitForTimeout(1000)
      }

      const scrollContainer = page.locator('.chat-scroll')
      await expect(scrollContainer).toBeVisible({ timeout: 10_000 })
    })

    test('sends a message and it appears at the bottom', async ({ page }) => {
      const channelLinks = page.locator('a[href*="/channels/"]')
      const firstChannel = channelLinks.first()
      if (await firstChannel.isVisible({ timeout: 5_000 })) {
        await firstChannel.click()
        await page.waitForTimeout(1000)
      }

      const uniqueText = `e2e-test-${Date.now()}`
      await sendMessage(page, uniqueText)

      const sentMsg = page.locator(`text=${uniqueText}`)
      await expect(sentMsg).toBeVisible({ timeout: 5_000 })
    })

    test('scroll-to-bottom button appears when scrolled away', async ({ page }) => {
      const channelLinks = page.locator('a[href*="/channels/"]')
      const firstChannel = channelLinks.first()
      if (await firstChannel.isVisible({ timeout: 5_000 })) {
        await firstChannel.click()
        await page.waitForTimeout(1000)
      }

      const scrollContainer = page.locator('.chat-scroll')
      const messages = page.locator('[id^="msg-"]')
      const msgCount = await messages.count()

      if (msgCount > 5) {
        await scrollContainer.evaluate((el) => { el.scrollTop = -9999 })
        await page.waitForTimeout(500)

        const bottomBtn = page.locator('button[aria-label="Jump to latest messages"]')
        await expect(bottomBtn).toBeVisible({ timeout: 3_000 })

        await bottomBtn.click()
        await page.waitForTimeout(500)

        const scrollTop = await scrollContainer.evaluate((el) => Math.abs(el.scrollTop))
        expect(scrollTop).toBeLessThan(50)
      }
    })
  })

  test.describe('Thread Panel', () => {
    test('opens a thread and shows parent message + replies', async ({ page }) => {
      const channelLinks = page.locator('a[href*="/channels/"]')
      const firstChannel = channelLinks.first()
      if (await firstChannel.isVisible({ timeout: 5_000 })) {
        await firstChannel.click()
        await page.waitForTimeout(1000)
      }

      const messageWithThread = page.locator('[id^="msg-"]').filter({
        has: page.locator('[class*="thread"], button:has-text("thread"), button:has-text("Thread")')
      }).first()

      if (await messageWithThread.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const threadBtn = messageWithThread.locator('button:has-text("thread"), button:has-text("Thread")').first()
        await threadBtn.click()
        await page.waitForTimeout(1000)

        const threadPanel = page.locator('text=Thread').first()
        await expect(threadPanel).toBeVisible({ timeout: 5_000 })

        const threadScrollContainer = page.locator('.chat-scroll').last()
        await expect(threadScrollContainer).toBeVisible()
      }
    })

    test('sends a reply in thread', async ({ page }) => {
      const channelLinks = page.locator('a[href*="/channels/"]')
      const firstChannel = channelLinks.first()
      if (await firstChannel.isVisible({ timeout: 5_000 })) {
        await firstChannel.click()
        await page.waitForTimeout(1000)
      }

      const messages = page.locator('[id^="msg-"]')
      const firstMsg = messages.first()
      if (await firstMsg.isVisible({ timeout: 3_000 })) {
        await firstMsg.hover()
        await page.waitForTimeout(300)

        const threadAction = firstMsg.locator('button[aria-label*="thread"], button[title*="thread"]').first()
        if (await threadAction.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await threadAction.click()
          await page.waitForTimeout(1000)

          const threadInput = page.locator('textarea[placeholder*="thread"], textarea[placeholder*="Reply"]').last()
          if (await threadInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            const uniqueReply = `thread-reply-${Date.now()}`
            await threadInput.fill(uniqueReply)
            await page.keyboard.press('Enter')
            await page.waitForTimeout(1500)

            const sentReply = page.locator(`text=${uniqueReply}`)
            await expect(sentReply).toBeVisible({ timeout: 5_000 })
          }
        }
      }
    })
  })

  test.describe('Forum Post Panel', () => {
    test('opens a forum post and shows root post + replies', async ({ page }) => {
      const forumChannel = page.locator('a[href*="/channels/"]').filter({ hasText: /forum/i }).first()

      if (await forumChannel.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await forumChannel.click()
        await page.waitForTimeout(1000)

        const postCard = page.locator('[class*="post"], [class*="forum"] button, [class*="forum"] a').first()
        if (await postCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await postCard.click()
          await page.waitForTimeout(1000)

          const postPanel = page.locator('.chat-scroll').last()
          await expect(postPanel).toBeVisible({ timeout: 5_000 })

          const replyText = page.locator('text=/\\d+ repl(y|ies)/i')
          await expect(replyText).toBeVisible({ timeout: 5_000 })
        }
      }
    })

    test('sends a forum reply', async ({ page }) => {
      const forumChannel = page.locator('a[href*="/channels/"]').filter({ hasText: /forum/i }).first()

      if (await forumChannel.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await forumChannel.click()
        await page.waitForTimeout(1000)

        const postCard = page.locator('[class*="post"], [class*="forum"] button, [class*="forum"] a').first()
        if (await postCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await postCard.click()
          await page.waitForTimeout(1000)

          const replyInput = page.locator('textarea[placeholder*="Reply to post"]').last()
          if (await replyInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            const uniqueReply = `forum-reply-${Date.now()}`
            await replyInput.fill(uniqueReply)
            await page.keyboard.press('Enter')
            await page.waitForTimeout(1500)

            const sentReply = page.locator(`text=${uniqueReply}`)
            await expect(sentReply).toBeVisible({ timeout: 5_000 })
          }
        }
      }
    })
  })

  test.describe('DM Surface', () => {
    test('loads DM messages with scroll container', async ({ page }) => {
      const dmSection = page.locator('a[href*="/dm/"], button:has-text("Direct Messages"), [data-testid*="dm"]').first()
      if (await dmSection.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await dmSection.click()
        await page.waitForTimeout(1000)

        const convLinks = page.locator('a[href*="/dm/"]')
        const firstConv = convLinks.first()
        if (await firstConv.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await firstConv.click()
          await page.waitForTimeout(1000)

          const scrollContainer = page.locator('.chat-scroll')
          await expect(scrollContainer).toBeVisible({ timeout: 10_000 })
        }
      }
    })
  })

  test.describe('Search Deep-Link', () => {
    test('search result click navigates to the correct message', async ({ page }) => {
      const channelLinks = page.locator('a[href*="/channels/"]')
      const firstChannel = channelLinks.first()
      if (await firstChannel.isVisible({ timeout: 5_000 })) {
        await firstChannel.click()
        await page.waitForTimeout(1000)
      }

      const searchButton = page.locator('button[aria-label*="search"], button[aria-label*="Search"], [data-testid="search-button"]').first()
      if (await searchButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchButton.click()
        await page.waitForTimeout(500)

        const searchInput = page.locator('input[placeholder*="Search"]').first()
        if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await searchInput.fill('test')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2000)

          const resultItems = page.locator('[class*="search"] button, aside button').filter({
            has: page.locator('span, p')
          })
          const firstResult = resultItems.first()

          if (await firstResult.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await firstResult.click()
            await page.waitForTimeout(1500)

            const highlightedMsg = page.locator('[class*="bg-primary"]')
            await expect(highlightedMsg).toBeVisible({ timeout: 5_000 })
          }
        }
      }
    })
  })
})
