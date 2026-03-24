import type { Deal } from "../types.js";

const EPIC_API =
  "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";

interface EpicGame {
  title: string;
  id: string;
  description: string;
  effectiveDate: string;
  keyImages: { type: string; url: string }[];
  productSlug: string;
  urlSlug: string;
  catalogNs: { mappings: { pageSlug: string; pageType: string }[] };
  promotions: {
    promotionalOffers: {
      promotionalOffers: { startDate: string; endDate: string }[];
    }[];
  } | null;
}

function isCurrentlyFree(game: EpicGame): boolean {
  const offers = game.promotions?.promotionalOffers;
  if (!offers?.length) return false;
  const now = new Date();
  return offers.some((group) =>
    group.promotionalOffers.some(
      (o) => new Date(o.startDate) <= now && new Date(o.endDate) > now,
    ),
  );
}

function getSlug(game: EpicGame): string {
  return (
    game.catalogNs?.mappings?.find((m) => m.pageType === "productHome")
      ?.pageSlug ??
    game.productSlug ??
    game.urlSlug
  );
}

function getStoreUrl(game: EpicGame): string {
  return `https://store.epicgames.com/en-US/p/${getSlug(game)}`;
}

function getClientUrl(game: EpicGame): string {
  return `com.epicgames.launcher://store/p/${getSlug(game)}`;
}

function getThumbnail(game: EpicGame): string | undefined {
  return (
    game.keyImages.find((i) => i.type === "OfferImageWide")?.url ??
    game.keyImages.find((i) => i.type === "Thumbnail")?.url ??
    game.keyImages[0]?.url
  );
}

export async function fetchEpicDeals(): Promise<Deal[]> {
  try {
    const res = await fetch(EPIC_API);
    if (!res.ok) {
      console.error(`[epic] API returned ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      data: {
        Catalog: {
          searchStore: { elements: EpicGame[] };
        };
      };
    };

    const games = data.data.Catalog.searchStore.elements;
    return games.filter(isCurrentlyFree).map((game) => ({
      id: `epic:${game.id}`,
      source: "Epic Games" as const,
      title: game.title,
      description: game.description,
      url: getStoreUrl(game),
      clientUrl: getClientUrl(game),
      imageUrl: getThumbnail(game),
    }));
  } catch (err) {
    console.error("[epic] Fetch error:", err);
    return [];
  }
}
