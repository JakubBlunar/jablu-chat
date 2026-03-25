import type { Deal } from '../types.js'

const STEAM_FEATURED = 'https://store.steampowered.com/api/featuredcategories?cc=sk&l=en'

interface SteamFeatured {
  specials?: {
    items: SteamItem[]
  }
}

interface SteamItem {
  id: number
  name: string
  discounted: boolean
  discount_percent: number
  original_price: number
  final_price: number
  header_image: string
}

export async function fetchSteamDeals(): Promise<Deal[]> {
  try {
    const res = await fetch(STEAM_FEATURED)
    if (!res.ok) {
      console.error(`[steam] API returned ${res.status}`)
      return []
    }

    const data = (await res.json()) as SteamFeatured
    const items = data.specials?.items ?? []

    return items
      .filter((item) => item.discount_percent === 100 && item.final_price === 0)
      .map((item) => ({
        id: `steam:${item.id}`,
        source: 'Steam' as const,
        title: item.name,
        description: 'Free on Steam — 100% off!',
        url: `https://store.steampowered.com/app/${item.id}`,
        clientUrl: `steam://store/${item.id}`,
        imageUrl: item.header_image || undefined
      }))
  } catch (err) {
    console.error('[steam] Fetch error:', err)
    return []
  }
}
