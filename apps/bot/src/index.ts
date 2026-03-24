import cron from "node-cron";
import { config } from "./config.js";
import { wasPosted, markPosted, cleanOldEntries } from "./db.js";
import { formatDeal } from "./format.js";
import { fetchEpicDeals } from "./sources/epic.js";
import { fetchSteamDeals } from "./sources/steam.js";
import { fetchTestDeals } from "./sources/test.js";
import type { Deal } from "./types.js";
import { postToWebhook } from "./webhook.js";

const isTestMode = process.argv.includes("--test");

async function postDeals(
  deals: Deal[],
  skipDuplicateCheck: boolean,
): Promise<void> {
  if (deals.length === 0) {
    console.log("[poll] No deals to post.");
    return;
  }

  console.log(
    `[poll] Found ${deals.length} deal(s): ${deals.map((d) => d.title).join(", ")}`,
  );

  for (const webhookUrl of config.webhookUrls) {
    const newDeals = skipDuplicateCheck
      ? deals
      : deals.filter((d) => !wasPosted(d.id, webhookUrl));

    if (newDeals.length === 0) {
      console.log(`[poll] No new deals for webhook …${webhookUrl.slice(-12)}`);
      continue;
    }

    console.log(
      `[poll] Posting ${newDeals.length} deal(s) to …${webhookUrl.slice(-12)}`,
    );

    for (const deal of newDeals) {
      const message = formatDeal(deal);
      const ok = await postToWebhook(webhookUrl, message);
      if (ok) {
        if (!skipDuplicateCheck) markPosted(deal.id, webhookUrl);
        console.log(`[poll] ✓ Posted "${deal.title}"`);
      } else {
        console.error(`[poll] ✗ Failed "${deal.title}"`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function pollAndPost(): Promise<void> {
  console.log(`[poll] Checking for free games at ${new Date().toISOString()}`);
  const [epicDeals, steamDeals] = await Promise.all([
    fetchEpicDeals(),
    fetchSteamDeals(),
  ]);
  await postDeals([...epicDeals, ...steamDeals], false);
}

// Startup
console.log("=== FreeGameBot ===");
console.log(`Webhooks: ${config.webhookUrls.length} configured`);
console.log(`Database: ${config.dbPath}`);

if (isTestMode) {
  console.log("[test] Running in test mode — posting sample deals...\n");
  const deals = fetchTestDeals();
  void postDeals(deals, true).then(() => {
    console.log("\n[test] Done.");
    process.exit(0);
  });
} else {
  console.log(`Schedule: ${config.pollCron}\n`);

  cleanOldEntries(90);
  void pollAndPost();

  cron.schedule(config.pollCron, () => {
    void pollAndPost();
  });

  console.log("[bot] Scheduler started. Waiting for next poll...");
}
