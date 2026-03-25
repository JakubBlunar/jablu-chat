export interface Deal {
  id: string
  source: 'Epic Games' | 'Steam'
  title: string
  description: string
  url: string
  clientUrl?: string
  imageUrl?: string
}
