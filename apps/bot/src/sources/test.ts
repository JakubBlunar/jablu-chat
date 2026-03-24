import type { Deal } from "../types.js";

export function fetchTestDeals(): Deal[] {
  return [
    {
      id: `test:${Date.now()}`,
      source: "Epic Games",
      title: "Test Game — Epic Edition",
      description: "This is a test deal to verify the bot is working correctly.",
      url: "https://store.epicgames.com/en-US/p/fortnite",
      clientUrl: "com.epicgames.launcher://store/p/fortnite",
      imageUrl:
        "https://cdn1.epicgames.com/offer/fn/23BR_C5S1_EGS_Launcher_Blade_2560x1440_2560x1440-50f75acafe07bd117a7dfe12253256f6.jpg",
    },
    {
      id: `test:${Date.now() + 1}`,
      source: "Steam",
      title: "Test Game — Steam Edition",
      description: "Another test deal to verify Steam formatting and deep links.",
      url: "https://store.steampowered.com/app/730",
      clientUrl: "steam://store/730",
      imageUrl:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg",
    },
  ];
}
