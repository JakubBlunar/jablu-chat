import cron from 'node-cron'
import { config } from './config.js'
import { wasPosted, markPosted, cleanOldEntries } from './db.js'
import { formatDeal } from './format.js'
import { fetchEpicDeals } from './sources/epic.js'
import { fetchGamerPowerDeals } from './sources/gamerpower.js'
import { fetchGogDeals } from './sources/gog.js'
import { fetchSteamDeals } from './sources/steam.js'
import { fetchTestDeals } from './sources/test.js'
import type { Deal } from './types.js'
import { postToWebhook } from './webhook.js'

const isTestMode = process.argv.includes('--test')

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Merge primary (direct API) deals with supplementary (aggregator) deals.
 * Primary deals win when titles collide — they have richer metadata like
 * client deep-links and higher-quality images.
 */
function mergeAndDeduplicate(primaryDeals: Deal[], supplementaryDeals: Deal[]): Deal[] {
  const seenTitles = new Set<string>()
  const result: Deal[] = []

  for (const deal of primaryDeals) {
    const key = normalizeTitle(deal.title)
    if (!seenTitles.has(key)) {
      seenTitles.add(key)
      result.push(deal)
    }
  }

  for (const deal of supplementaryDeals) {
    const key = normalizeTitle(deal.title)
    if (!seenTitles.has(key)) {
      seenTitles.add(key)
      result.push(deal)
    }
  }

  return result
}

async function postDeals(deals: Deal[], skipDuplicateCheck: boolean): Promise<void> {
  if (deals.length === 0) {
    console.log('[poll] No deals to post.')
    return
  }

  console.log(`[poll] Found ${deals.length} deal(s): ${deals.map((d) => `${d.title} [${d.source}]`).join(', ')}`)

  for (const webhookUrl of config.webhookUrls) {
    const newDeals = skipDuplicateCheck ? deals : deals.filter((d) => !wasPosted(d.id, webhookUrl))

    if (newDeals.length === 0) {
      console.log(`[poll] No new deals for webhook …${webhookUrl.slice(-12)}`)
      continue
    }

    console.log(`[poll] Posting ${newDeals.length} deal(s) to …${webhookUrl.slice(-12)}`)

    for (const deal of newDeals) {
      const message = formatDeal(deal)
      const ok = await postToWebhook(webhookUrl, message)
      if (ok) {
        if (!skipDuplicateCheck) markPosted(deal.id, webhookUrl)
        console.log(`[poll] ✓ Posted "${deal.title}" (${deal.source})`)
      } else {
        console.error(`[poll] ✗ Failed "${deal.title}"`)
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

async function pollAndPost(): Promise<void> {
  console.log(`[poll] Checking for free games at ${new Date().toISOString()}`)

  const [epicDeals, steamDeals, gogDeals, gamerPowerDeals] = await Promise.all([
    fetchEpicDeals(),
    fetchSteamDeals(),
    fetchGogDeals(),
    fetchGamerPowerDeals()
  ])

  const primaryDeals = [...epicDeals, ...steamDeals, ...gogDeals]
  const allDeals = mergeAndDeduplicate(primaryDeals, gamerPowerDeals)

  console.log(
    `[poll] ${primaryDeals.length} from direct APIs + ${gamerPowerDeals.length} from GamerPower → ${allDeals.length} after de-duplication`
  )

  await postDeals(allDeals, false)
}

console.log('=== FreeGameBot ===')
console.log(`Webhooks: ${config.webhookUrls.length} configured`)
console.log(`Database: ${config.dbPath}`)
console.log(`Sources: Epic Games, Steam, GOG, GamerPower (aggregator)`)

if (isTestMode) {
  console.log('[test] Running in test mode — posting sample deals...\n')
  const deals = fetchTestDeals()
  void postDeals(deals, true).then(() => {
    console.log('\n[test] Done.')
    process.exit(0)
  })
} else {
  console.log(`Schedule: ${config.pollCron}\n`)

  cleanOldEntries(90)
  void pollAndPost()

  cron.schedule(config.pollCron, () => {
    void pollAndPost()
  })

  console.log('[bot] Scheduler started. Waiting for next poll...')
}
