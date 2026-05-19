import type { Client } from 'discord.js';
import { RankTrackingService } from './RankTrackingService';
import { PuddleFarmService } from './PuddleFarmService';
import { buildPanel } from './RankPanelBuilder';

async function fetchAllGuilds(): Promise<void> {
  console.log('[RankScheduler] Starting hourly fetch...');
  await RankTrackingService.fetchAndStoreAll();
  console.log('[RankScheduler] Hourly fetch complete');
}

async function postDailySummary(client: Client): Promise<void> {
  console.log('[RankScheduler] Posting daily summaries...');
  const configs = await RankTrackingService.getAllPostConfigs();
  for (const config of configs) {
    try {
      const channel = await client.channels.fetch(config.channel_id);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;
      const payload = await buildPanel({ guildId: config.guild_id, days: 7 });
      await (channel as any).send(payload);
    } catch (err) {
      console.error(`[RankScheduler] Failed to post to guild ${config.guild_id}:`, err);
    }
  }
  console.log('[RankScheduler] Daily summaries posted');
}

function msUntilUtc11(): number {
  const now = new Date();
  // JST 20:00 = UTC 11:00
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    11, 0, 0, 0,
  ));
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime() - now.getTime();
}

export function startScheduler(client: Client): void {
  // Health check on startup
  PuddleFarmService.healthCheck().then(ok => {
    if (ok) {
      console.log('✅ puddle.farm /health OK');
    } else {
      console.warn('⚠️ puddle.farm /health check failed — API may be unavailable');
    }
  });

  // Initial fetch 5 seconds after boot
  setTimeout(() => fetchAllGuilds().catch(console.error), 5000);

  // Hourly fetch
  setInterval(() => fetchAllGuilds().catch(console.error), 60 * 60 * 1000);

  // Daily summary at JST 20:00 (UTC 11:00)
  const wait = msUntilUtc11();
  console.log(`[RankScheduler] Next daily summary in ${Math.round(wait / 60000)} min`);
  setTimeout(() => {
    postDailySummary(client).catch(console.error);
    setInterval(() => postDailySummary(client).catch(console.error), 24 * 60 * 60 * 1000);
  }, wait);
}
