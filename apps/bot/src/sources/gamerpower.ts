import type { Deal, DealSource } from '../types.js'

const GAMERPOWER_API = 'https://www.gamerpower.com/api/giveaways?type=game&sort-by=date'

const ALLOWED_SOURCES: Set<DealSource> = new Set(['Epic Games', 'Steam', 'GOG', 'Humble Bundle'])

interface GamerPowerGiveaway {
  id: number
  title: string
  worth: string
  thumbnail: string
  image: string
  description: string
  instructions: string
  open_giveaway_url: string
  published_date: string
  type: string
  platforms: string
  end_date: string
  users: number
  status: string
  gamerpower_url: string
}

const PLATFORM_SOURCE_MAP: Record<string, DealSource> = {
  'epic games store': 'Epic Games',
  steam: 'Steam',
  gog: 'GOG',
  'gog.com': 'GOG',
  'humble bundle': 'Humble Bundle',
  'humble store': 'Humble Bundle'
}

function detectSource(platforms: string): DealSource | null {
  const lower = platforms.toLowerCase()
  for (const [key, source] of Object.entries(PLATFORM_SOURCE_MAP)) {
    if (lower.includes(key)) return source
  }
  return null
}

function parseTitle(rawTitle: string): string {
  let title = rawTitle.trim()
  const parenMatch = title.match(/^(.+?)\s*\([^)]+\)\s*$/)
  if (parenMatch) title = parenMatch[1].trim()
  title = title.replace(/\s+Giveaway$/i, '').trim()
  return title
}

function parseWorth(worth: string): string | undefined {
  if (!worth || worth === 'N/A' || worth === '$0' || worth === '$0.00') return undefined
  return worth
}

function parseEndDate(endDate: string): string | undefined {
  if (!endDate || endDate === 'N/A') return undefined
  const d = new Date(endDate)
  if (isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export async function fetchGamerPowerDeals(): Promise<Deal[]> {
  try {
    const res = await fetch(GAMERPOWER_API, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) {
      if (res.status === 404) {
        console.log('[gamerpower] No active giveaways (404)')
        return []
      }
      console.error(`[gamerpower] API returned ${res.status}`)
      return []
    }

    const data = (await res.json()) as GamerPowerGiveaway[] | { status: number; status_message: string }

    if (!Array.isArray(data)) {
      console.log(
        `[gamerpower] API returned non-array: ${(data as { status_message?: string }).status_message ?? 'unknown'}`
      )
      return []
    }

    const deals: Deal[] = []

    for (const g of data) {
      if (g.status !== 'Active' || g.type !== 'Game') continue

      const source = detectSource(g.platforms)
      if (!source || !ALLOWED_SOURCES.has(source)) continue

      deals.push({
        id: `gp:${g.id}`,
        source,
        title: parseTitle(g.title),
        description: g.description?.slice(0, 200) || `Free on ${source}!`,
        url: g.open_giveaway_url,
        originalPrice: parseWorth(g.worth),
        freeUntil: parseEndDate(g.end_date)
      })
    }

    console.log(`[gamerpower] ${deals.length} deal(s) from major stores (filtered from ${data.length} total)`)
    return deals
  } catch (err) {
    console.error('[gamerpower] Fetch error:', err)
    return []
  }
}
