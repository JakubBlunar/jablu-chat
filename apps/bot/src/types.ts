export type DealSource = 'Epic Games' | 'Steam' | 'GOG' | 'Humble Bundle' | 'itch.io' | (string & {})

export interface Deal {
  id: string
  source: DealSource
  title: string
  description: string
  url: string
  clientUrl?: string
  imageUrl?: string
  originalPrice?: string
  freeUntil?: string
}
