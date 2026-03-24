import cron from "node-cron";
import { config } from "./config.js";
import { wasPosted, markPosted, cleanOldEntries } from "./db.js";
import { formatDeal } from "./format.js";
import { fetchEpicDeals } from "./sources/epic.js";
import { fetchSteamDeals } from "./sources/steam.js";
import type { Deal } from "./types.js";
import { postToWebhook } from "./webhook.js";

async function pollAndPost(): Promise<void> {
  console.log(`[poll] Checking for free games at ${new Date().toISOString()}`);

  const [epicDeals, steamDeals] = await Promise.all([
    fetchEpicDeals(),
    fetchSteamDeals(),
  ]);
  const allDeals: Deal[] = [...epicDeals, ...steamDeals];

  if (allDeals.length === 0) {
    console.log("[poll] No free games found.");
    return;
  }

  console.log(`[poll] Found ${allDeals.length} deal(s): ${allDeals.map((d) => d.title).join(", ")}`);

  for (const webhookUrl of config.webhookUrls) {
    const newDeals = allDeals.filter((d) => !wasPosted(d.id, webhookUrl));
    if (newDeals.length === 0) {
      console.log(`[poll] No new deals for webhook ${webhookUrl.slice(-12)}`);
      continue;
    }

    console.log(
      `[poll] Posting ${newDeals.length} new deal(s) to ${webhookUrl.slice(-12)}`,
    );

    for (const deal of newDeals) {
      const message = formatDeal(deal);
      const ok = await postToWebhook(webhookUrl, message);
      if (ok) {
        markPosted(deal.id, webhookUrl);
        console.log(`[poll] ✓ Posted "${deal.title}" to ${webhookUrl.slice(-12)}`);
      } else {
        console.error(`[poll] ✗ Failed "${deal.title}" to ${webhookUrl.slice(-12)}`);
      }
      // Small delay between posts to avoid flooding
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// Startup
console.log("=== FreeGameBot ===");
console.log(`Webhooks: ${config.webhookUrls.length} configured`);
console.log(`Schedule: ${config.pollCron}`);
console.log(`Database: ${config.dbPath}`);
console.log("");

// Clean old entries on startup
cleanOldEntries(90);

// Run once immediately
void pollAndPost();

// Schedule recurring polls
cron.schedule(config.pollCron, () => {
  void pollAndPost();
});

console.log("[bot] Scheduler started. Waiting for next poll...");
