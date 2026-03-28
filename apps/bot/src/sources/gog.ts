import type { Deal } from '../types.js'

const GOG_CATALOG_API =
  'https://catalog.gog.com/v1/catalog?limit=50&price=between:0,0&discounted=eq:true&productType=in:game,pack&order=desc:trending&locale=en-US&currencyCode=USD&countryCode=US'

interface GogProduct {
  id: string
  title: string
  coverVertical: string
  coverHorizontal: string
  storeLink: string
  price: {
    final: string
    base: string
    discount: string
    isFree: boolean
    isDiscounted: boolean
  }
  screenshots: string[]
}

interface GogCatalogResponse {
  products: GogProduct[]
  pages: number
  productCount: number
}

function getGogUrl(product: GogProduct): string {
  const slug = product.storeLink?.replace(/^\/.*\/game\//, '') ?? product.id
  return `https://www.gog.com/en/game/${slug}`
}

function getGogImage(product: GogProduct): string | undefined {
  const img = product.coverHorizontal || product.coverVertical || product.screenshots?.[0]
  if (!img) return undefined
  return img.startsWith('//') ? `https:${img}` : img
}

function getOriginalPrice(product: GogProduct): string | undefined {
  const base = product.price?.base
  if (!base || base === '0' || base === '0.00') return undefined
  return `$${base}`
}

export async function fetchGogDeals(): Promise<Deal[]> {
  try {
    const res = await fetch(GOG_CATALOG_API)
    if (!res.ok) {
      console.error(`[gog] Catalog API returned ${res.status}`)
      return []
    }

    const data = (await res.json()) as GogCatalogResponse
    if (!data.products?.length) {
      console.log('[gog] No discounted-to-free products found')
      return []
    }

    const deals = data.products
      .filter((p) => p.price?.isDiscounted && (p.price.isFree || p.price.final === '0' || p.price.final === '0.00'))
      .map((product) => ({
        id: `gog:${product.id}`,
        source: 'GOG' as const,
        title: product.title,
        description: 'Free on GOG — DRM-free!',
        url: getGogUrl(product),
        imageUrl: getGogImage(product),
        originalPrice: getOriginalPrice(product)
      }))

    console.log(`[gog] ${deals.length} free game(s) found`)
    return deals
  } catch (err) {
    console.error('[gog] Fetch error:', err)
    return []
  }
}
