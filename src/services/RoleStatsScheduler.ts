import type { Client } from 'discord.js';
import { RoleStatsService } from './RoleStatsService';

// 自動更新の間隔。ロール人数はメッセージ編集で反映するため、
// Discord のレート制限に余裕を持たせて10分間隔とする。
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
// 起動直後の初回更新までの待機時間(クライアント準備を待つ)。
const INITIAL_DELAY_MS = 15 * 1000;

async function refreshAllPanels(client: Client): Promise<void> {
  const panels = await RoleStatsService.getAllPanels();
  if (panels.length === 0) return;

  for (const { guildId, location } of panels) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await client.channels.fetch(location.channelId);
      if (!channel || !channel.isTextBased()) continue;

      const message = await channel.messages.fetch(location.messageId).catch(() => null);
      if (!message) {
        // メッセージが削除されていたら登録を解除
        await RoleStatsService.clearPanel(guildId);
        continue;
      }

      const payload = await RoleStatsService.buildPanel(guild);
      await message.edit(payload);
    } catch (err) {
      console.error(`[RoleStatsScheduler] Failed to update panel for guild ${guildId}:`, err);
    }
  }
}

export function startRoleStatsScheduler(client: Client): () => void {
  const timeout = setTimeout(() => {
    refreshAllPanels(client).catch(console.error);
  }, INITIAL_DELAY_MS);

  const interval = setInterval(() => {
    refreshAllPanels(client).catch(console.error);
  }, UPDATE_INTERVAL_MS);

  return () => {
    clearTimeout(timeout);
    clearInterval(interval);
  };
}
