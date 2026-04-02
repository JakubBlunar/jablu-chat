import { BotClient, Permission, hasPermission } from '@chat/sdk'
import cron from 'node-cron'
import { config } from './config.js'
import { wasPosted, markPosted, cleanOldEntries } from './db.js'
import { formatBatch } from './format.js'
import { fetchEpicDeals } from './sources/epic.js'
import { fetchGamerPowerDeals } from './sources/gamerpower.js'
import { fetchGogDeals } from './sources/gog.js'
import { fetchSteamDeals } from './sources/steam.js'
import { fetchTestDeals } from './sources/test.js'
import type { Deal, DealSource } from './types.js'

const isTestMode = process.argv.includes('--test')

const ALL_SOURCES: DealSource[] = ['Epic Games', 'Steam', 'GOG', 'GamerPower']

const SOURCE_ALIASES: Record<string, string> = {
  epic: 'epic games',
  steam: 'steam',
  gog: 'gog',
  gamerpower: 'gamerpower',
}

function normalizeSource(input: string): string {
  return SOURCE_ALIASES[input.toLowerCase()] ?? input.toLowerCase()
}

interface ChannelConfig {
  serverId: string
  enabled: boolean
  sources?: string[]
}

const bot = new BotClient({
  token: config.botToken,
  serverUrl: config.serverUrl,
  storagePath: config.dbPath.replace('.db', '-storage.db')
})

bot.registerCommands([
  { name: 'help', description: 'Show available commands and how to configure the bot' },
  { name: 'setup', description: 'Register this channel for free game deal notifications', requiredPermission: 'MANAGE_CHANNELS' },
  { name: 'stop', description: 'Stop free game deal notifications in this channel', requiredPermission: 'MANAGE_CHANNELS' },
  {
    name: 'sources',
    description: 'Configure which game sources to check for this channel',
    parameters: [
      { name: 'sources', type: 'string' as const, description: 'Comma-separated: epic,steam,gog,gamerpower', required: true }
    ],
    requiredPermission: 'MANAGE_CHANNELS'
  },
  { name: 'deals', description: 'Check for free games right now' },
  { name: 'status', description: 'Show bot status and configured channels' }
])

bot.onCommand('help', async (ctx) => {
  const canManage = !ctx.isDm && hasPermission(ctx.userPermissions, Permission.MANAGE_CHANNELS)

  const lines = [
    '**FreeGameBot — Commands**',
    '',
    ...(canManage ? [
      '`/setup` — Register this channel to receive free game notifications',
      '`/stop` — Unregister this channel from notifications',
      '`/sources <epic,steam,gog,gamerpower>` — Choose which stores to monitor (comma-separated)',
    ] : []),
    '`/deals` — Check for free games right now',
    '`/status` — Show bot status and how many channels are monitored',
    '`/help` — Show this message',
  ]

  if (canManage) {
    lines.push('', '**Quick start:** Run `/setup` in a channel, then optionally `/sources epic,steam` to filter stores.')
  }

  await ctx.reply(lines.join('\n'))
})

bot.onCommand('setup', async (ctx) => {
  if (ctx.isDm) {
    await ctx.reply('The `/setup` command can only be used in a server channel.')
    return
  }
  if (!hasPermission(ctx.userPermissions, Permission.MANAGE_CHANNELS)) {
    await ctx.reply('You need the **Manage Channels** permission to use this command.')
    return
  }
  bot.storage.set(`channel:${ctx.channelId}`, {
    serverId: ctx.serverId!,
    enabled: true,
    sources: ALL_SOURCES.map((s) => s.toLowerCase())
  } satisfies ChannelConfig)
  await ctx.reply('This channel will now receive free game deal notifications! Use `/sources` to customize which stores to check.')
})

bot.onCommand('stop', async (ctx) => {
  if (ctx.isDm) {
    await ctx.reply('The `/stop` command can only be used in a server channel.')
    return
  }
  if (!hasPermission(ctx.userPermissions, Permission.MANAGE_CHANNELS)) {
    await ctx.reply('You need the **Manage Channels** permission to use this command.')
    return
  }
  const existing = bot.storage.get<ChannelConfig>(`channel:${ctx.channelId}`)
  if (!existing) {
    await ctx.reply('This channel is not registered for deal notifications.')
    return
  }
  bot.storage.delete(`channel:${ctx.channelId}`)
  await ctx.reply('This channel will no longer receive free game deal notifications.')
})

bot.onCommand('sources', async (ctx) => {
  if (ctx.isDm) {
    await ctx.reply('The `/sources` command can only be used in a server channel.')
    return
  }
  if (!hasPermission(ctx.userPermissions, Permission.MANAGE_CHANNELS)) {
    await ctx.reply('You need the **Manage Channels** permission to use this command.')
    return
  }
  const existing = bot.storage.get<ChannelConfig>(`channel:${ctx.channelId}`)
  if (!existing?.enabled) {
    await ctx.reply('This channel is not set up yet. Run `/setup` first.')
    return
  }

  const raw = ctx.args.sources
  if (!raw) {
    const current = existing.sources?.join(', ') ?? 'all'
    await ctx.reply(`Current sources: ${current}\nAvailable: epic, steam, gog, gamerpower`)
    return
  }

  const VALID_SOURCES = new Set(Object.keys(SOURCE_ALIASES))
  const parsed = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const invalid = parsed.filter((s) => !VALID_SOURCES.has(s))
  if (invalid.length > 0) {
    await ctx.reply(`Unknown source(s): ${invalid.join(', ')}\nAvailable: epic, steam, gog, gamerpower`)
    return
  }

  const sources = parsed.map(normalizeSource)
  bot.storage.set(`channel:${ctx.channelId}`, { ...existing, sources })
  await ctx.reply(`Sources updated: ${sources.join(', ')}`)
})

bot.onCommand('deals', async (ctx) => {
  await ctx.reply('Checking for free games...')
  const deals = await fetchAllDeals()

  let allowedSources: string[]
  if (ctx.isDm) {
    allowedSources = ALL_SOURCES.map((s) => s.toLowerCase())
  } else {
    const channelConfig = bot.storage.get<ChannelConfig>(`channel:${ctx.channelId}`)
    allowedSources = (channelConfig?.sources ?? ALL_SOURCES.map((s) => s.toLowerCase())).map(normalizeSource)
  }
  const filtered = deals.filter((d) => allowedSources.includes(d.source.toLowerCase()))

  if (filtered.length === 0) {
    await ctx.reply('No free games available right now!')
    return
  }

  await ctx.reply(formatBatch(filtered))
})

bot.onCommand('status', async (ctx) => {
  if (ctx.isDm) {
    const lines = [
      `**FreeGameBot Status**`,
      `Bot is online and running.`,
      `Poll schedule: ${config.pollCron}`,
      `Use \`/status\` in a server channel to see channel-specific configuration.`
    ]
    await ctx.reply(lines.join('\n'))
    return
  }

  const channels = bot.storage.list('channel:*')
  const serverChannels = channels.filter((c) => {
    const cfg = c.value as ChannelConfig
    return cfg.enabled && cfg.serverId === ctx.serverId
  })

  const channelConfig = bot.storage.get<ChannelConfig>(`channel:${ctx.channelId}`)
  const sources = (channelConfig?.sources ?? ALL_SOURCES.map((s) => s.toLowerCase())).map(normalizeSource)

  const lines = [
    `**FreeGameBot Status**`,
    `Monitoring ${serverChannels.length} channel(s) in this server`,
    `Sources for this channel: ${channelConfig ? sources.join(', ') : '_not configured — run /setup_'}`,
    `Poll schedule: ${config.pollCron}`
  ]
  await ctx.reply(lines.join('\n'))
})

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

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

async function fetchAllDeals(): Promise<Deal[]> {
  const [epicDeals, steamDeals, gogDeals, gamerPowerDeals] = await Promise.all([
    fetchEpicDeals(),
    fetchSteamDeals(),
    fetchGogDeals(),
    fetchGamerPowerDeals()
  ])

  const primaryDeals = [...epicDeals, ...steamDeals, ...gogDeals]
  return mergeAndDeduplicate(primaryDeals, gamerPowerDeals)
}

async function postDeals(deals: Deal[], skipDuplicateCheck: boolean): Promise<void> {
  if (deals.length === 0) {
    console.log('[poll] No deals to post.')
    return
  }

  console.log(`[poll] Found ${deals.length} deal(s): ${deals.map((d) => `${d.title} [${d.source}]`).join(', ')}`)

  const channels = bot.storage.list('channel:*')
  for (const entry of channels) {
    const channelConfig = entry.value as ChannelConfig
    if (!channelConfig.enabled) continue

    const channelId = entry.key.replace('channel:', '')
    const allowedSources = (channelConfig.sources ?? ALL_SOURCES.map((s) => s.toLowerCase())).map(normalizeSource)

    const filtered = deals.filter((d) => allowedSources.includes(d.source.toLowerCase()))
    const newDeals = skipDuplicateCheck ? filtered : filtered.filter((d) => !wasPosted(d.id, channelId))

    if (newDeals.length === 0) {
      console.log(`[poll] No new deals for channel ${channelId.slice(0, 8)}…`)
      continue
    }

    console.log(`[poll] Posting ${newDeals.length} deal(s) to channel ${channelId.slice(0, 8)}…`)

    try {
      await bot.sendMessage(channelId, formatBatch(newDeals))
      if (!skipDuplicateCheck) {
        for (const deal of newDeals) markPosted(deal.id, channelId)
      }
      console.log(`[poll] Batch posted: ${newDeals.map((d) => d.title).join(', ')}`)
    } catch (err) {
      console.error(`[poll] Failed to post batch:`, (err as Error).message)
    }
  }
}

async function pollAndPost(): Promise<void> {
  console.log(`[poll] Checking for free games at ${new Date().toISOString()}`)
  const allDeals = await fetchAllDeals()
  console.log(`[poll] ${allDeals.length} deal(s) after de-duplication`)
  await postDeals(allDeals, false)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

console.log('=== FreeGameBot (SDK) ===')

if (isTestMode) {
  console.log('[test] Running in test mode — posting sample deals...\n')
  bot.connect().then(async () => {
    const deals = fetchTestDeals()
    await postDeals(deals, true)
    console.log('\n[test] Done.')
    bot.disconnect()
    process.exit(0)
  })
} else {
  bot.connect().then(() => {
    console.log(`Schedule: ${config.pollCron}\n`)
    cleanOldEntries(90)
    void pollAndPost()

    cron.schedule(config.pollCron, () => {
      void pollAndPost()
    })

    console.log('[bot] Scheduler started. Waiting for next poll...')
  })
}
