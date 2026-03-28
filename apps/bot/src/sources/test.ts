import type { Deal } from '../types.js'

export function fetchTestDeals(): Deal[] {
  const now = Date.now()
  const nextWeek = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()

  return [
    {
      id: `test:${now}`,
      source: 'Epic Games',
      title: 'Test Game — Epic Edition',
      description: 'This is a test deal to verify the bot is working correctly.',
      url: 'https://store.epicgames.com/en-US/p/fortnite',
      clientUrl: 'com.epicgames.launcher://store/p/fortnite',
      imageUrl:
        'https://cdn1.epicgames.com/offer/fn/23BR_C5S1_EGS_Launcher_Blade_2560x1440_2560x1440-50f75acafe07bd117a7dfe12253256f6.jpg',
      originalPrice: '$19.99',
      freeUntil: nextWeek
    },
    {
      id: `test:${now + 1}`,
      source: 'Steam',
      title: 'Test Game — Steam Edition',
      description: 'Another test deal to verify Steam formatting and deep links.',
      url: 'https://store.steampowered.com/app/730',
      clientUrl: 'steam://store/730',
      imageUrl: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg',
      originalPrice: '$14.99'
    },
    {
      id: `test:${now + 2}`,
      source: 'GOG',
      title: 'Test Game — GOG Edition',
      description: 'Free on GOG — DRM-free!',
      url: 'https://www.gog.com/en/game/test-game',
      imageUrl: 'https://images.gog-statics.com/placeholder.jpg',
      originalPrice: '$9.99'
    }
  ]
}
