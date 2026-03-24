import type { Deal } from "./types.js";

const SOURCE_EMOJI: Record<string, string> = {
  "Epic Games": "🎮",
  Steam: "🎯",
};

export function formatDeal(deal: Deal): string {
  const emoji = SOURCE_EMOJI[deal.source] ?? "🎁";
  const lines = [
    `${emoji} **FREE on ${deal.source}**`,
    "",
    `**${deal.title}**`,
    deal.description,
    `[Claim now](${deal.url})`,
  ];
  return lines.join("\n");
}

export function formatBatchSummary(deals: Deal[]): string {
  if (deals.length === 0) return "";

  const grouped = new Map<string, Deal[]>();
  for (const deal of deals) {
    const list = grouped.get(deal.source) ?? [];
    list.push(deal);
    grouped.set(deal.source, list);
  }

  const sections: string[] = [];
  for (const [source, items] of grouped) {
    const emoji = SOURCE_EMOJI[source] ?? "🎁";
    const header = `${emoji} **Free on ${source}**`;
    const list = items
      .map((d) => `• **${d.title}** — [Claim](${d.url})`)
      .join("\n");
    sections.push(`${header}\n${list}`);
  }

  return sections.join("\n\n");
}
