import type { Deal } from '../types.js'

const EPIC_PROMOTIONS_API = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions'

const EPIC_GRAPHQL = 'https://graphql.epicgames.com/graphql'

const CATALOG_SEARCH_QUERY = `
query searchStoreQuery(
  $country: String!
  $locale: String
  $count: Int
  $start: Int
  $onSale: Boolean
  $sortBy: String
  $sortDir: String
  $withPrice: Boolean!
  $withPromotions: Boolean!
) {
  Catalog {
    searchStore(
      country: $country
      locale: $locale
      count: $count
      start: $start
      onSale: $onSale
      sortBy: $sortBy
      sortDir: $sortDir
    ) {
      elements {
        title
        id
        namespace
        description
        effectiveDate
        offerType
        keyImages { type url }
        productSlug
        urlSlug
        catalogNs { mappings { pageSlug pageType } }
        price(country: $country) @include(if: $withPrice) {
          totalPrice {
            discountPrice
            originalPrice
            currencyCode
            currencyInfo { decimals }
            fmtPrice { originalPrice discountPrice }
          }
          lineOffers {
            appliedRules { endDate }
          }
        }
        promotions @include(if: $withPromotions) {
          promotionalOffers {
            promotionalOffers { startDate endDate }
          }
        }
      }
      paging { count total }
    }
  }
}
`.trim()

interface EpicPrice {
  totalPrice: {
    discountPrice: number
    originalPrice: number
    currencyCode: string
    currencyInfo: { decimals: number }
    fmtPrice: { originalPrice: string; discountPrice: string }
  }
  lineOffers: {
    appliedRules: { endDate: string | null }[]
  }[]
}

interface EpicGame {
  title: string
  id: string
  namespace?: string
  description: string
  effectiveDate: string
  offerType?: string
  keyImages: { type: string; url: string }[]
  productSlug: string
  urlSlug: string
  catalogNs: { mappings: { pageSlug: string; pageType: string }[] }
  promotions: {
    promotionalOffers: {
      promotionalOffers: { startDate: string; endDate: string }[]
    }[]
  } | null
  price?: EpicPrice
}

function getActivePromoEndDate(game: EpicGame): string | undefined {
  const now = new Date()
  for (const group of game.promotions?.promotionalOffers ?? []) {
    for (const offer of group.promotionalOffers) {
      if (new Date(offer.startDate) <= now && new Date(offer.endDate) > now) {
        return offer.endDate
      }
    }
  }
  for (const lo of game.price?.lineOffers ?? []) {
    for (const rule of lo.appliedRules) {
      if (rule.endDate) return rule.endDate
    }
  }
  return undefined
}

function isCurrentlyFree(game: EpicGame): boolean {
  const offers = game.promotions?.promotionalOffers
  if (offers?.length) {
    const now = new Date()
    const hasActivePromo = offers.some((group) =>
      group.promotionalOffers.some((o) => new Date(o.startDate) <= now && new Date(o.endDate) > now)
    )
    if (hasActivePromo) return true
  }

  if (game.price) {
    const { discountPrice, originalPrice } = game.price.totalPrice
    if (discountPrice === 0 && originalPrice > 0) return true
  }

  return false
}

function getSlug(game: EpicGame): string {
  return (
    game.catalogNs?.mappings?.find((m) => m.pageType === 'productHome')?.pageSlug ??
    game.productSlug ??
    game.urlSlug
  )
}

function getStoreUrl(game: EpicGame): string {
  return `https://store.epicgames.com/en-US/p/${getSlug(game)}`
}

function getClientUrl(game: EpicGame): string {
  return `com.epicgames.launcher://store/p/${getSlug(game)}`
}

function getThumbnail(game: EpicGame): string | undefined {
  return (
    game.keyImages.find((i) => i.type === 'OfferImageWide')?.url ??
    game.keyImages.find((i) => i.type === 'DieselStoreFrontWide')?.url ??
    game.keyImages.find((i) => i.type === 'Thumbnail')?.url ??
    game.keyImages[0]?.url
  )
}

function getOriginalPrice(game: EpicGame): string | undefined {
  const fmt = game.price?.totalPrice?.fmtPrice?.originalPrice
  if (fmt && fmt !== '0' && fmt !== '$0' && fmt !== '€0') return fmt
  return undefined
}

function gameToDeal(game: EpicGame): Deal {
  return {
    id: `epic:${game.id}`,
    source: 'Epic Games',
    title: game.title,
    description: game.description,
    url: getStoreUrl(game),
    clientUrl: getClientUrl(game),
    imageUrl: getThumbnail(game),
    originalPrice: getOriginalPrice(game),
    freeUntil: getActivePromoEndDate(game)
  }
}

async function fetchFromPromotionsApi(): Promise<EpicGame[]> {
  try {
    const url = `${EPIC_PROMOTIONS_API}?locale=en-US&country=US&allowCountries=US`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`[epic] Promotions API returned ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      data: { Catalog: { searchStore: { elements: EpicGame[]; paging: { count: number; total: number } } } }
    }
    const { elements, paging } = data.data.Catalog.searchStore
    console.log(`[epic] Promotions API: ${elements.length} elements (total: ${paging?.total ?? '?'})`)
    return elements
  } catch (err) {
    console.error('[epic] Promotions API error:', err)
    return []
  }
}

async function fetchFromCatalogSearch(): Promise<EpicGame[]> {
  try {
    const res = await fetch(EPIC_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: CATALOG_SEARCH_QUERY,
        variables: {
          country: 'US',
          locale: 'en-US',
          count: 40,
          start: 0,
          onSale: true,
          sortBy: 'currentPrice',
          sortDir: 'ASC',
          withPrice: true,
          withPromotions: true
        }
      })
    })
    if (!res.ok) {
      console.error(`[epic] Catalog search returned ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      data?: { Catalog: { searchStore: { elements: EpicGame[]; paging: { count: number; total: number } } } }
      errors?: { message: string }[]
    }
    if (data.errors?.length) {
      console.error(`[epic] GraphQL errors:`, data.errors.map((e) => e.message).join(', '))
      return []
    }
    if (!data.data) return []
    const { elements, paging } = data.data.Catalog.searchStore
    console.log(`[epic] Catalog search: ${elements.length} on-sale elements (total: ${paging?.total ?? '?'})`)
    return elements
  } catch (err) {
    console.error('[epic] Catalog search error:', err)
    return []
  }
}

export async function fetchEpicDeals(): Promise<Deal[]> {
  const [promoGames, catalogGames] = await Promise.all([fetchFromPromotionsApi(), fetchFromCatalogSearch()])

  const seen = new Set<string>()
  const deals: Deal[] = []

  for (const game of [...promoGames, ...catalogGames]) {
    if (seen.has(game.id)) continue
    if (!isCurrentlyFree(game)) continue
    seen.add(game.id)
    deals.push(gameToDeal(game))
  }

  console.log(`[epic] ${deals.length} free game(s) after de-duplication`)
  return deals
}
