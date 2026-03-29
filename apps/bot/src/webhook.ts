import { config } from './config.js'

const MAX_RETRIES = 3

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function postToWebhook(webhookUrl: string, content: string): Promise<boolean> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          username: config.botName,
          avatarUrl: config.botAvatarUrl
        })
      })

      if (res.ok) return true

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10)
        const waitMs = (isNaN(retryAfter) ? 5 : retryAfter) * 1000 * (attempt + 1)
        console.warn(`[webhook] Rate limited, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(waitMs)
        continue
      }

      const text = await res.text().catch(() => '')
      console.error(`[webhook] POST failed ${res.status}: ${text.slice(0, 200)}`)
      return false
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const waitMs = 3000 * (attempt + 1)
        console.warn(`[webhook] Network error, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(waitMs)
        continue
      }
      console.error('[webhook] Network error:', err)
      return false
    }
  }
  return false
}
