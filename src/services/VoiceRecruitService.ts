import {
  Client,
  VoiceState,
  VoiceChannel,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import type { VoiceBasedChannel } from 'discord.js';
import { getDatabase } from '../database';
import { SystemSettingModel } from '../models/SystemSetting';

/**
 * 簡易VC募集機能のサービス層。
 * - 設定（作成先カテゴリ / 募集通知チャンネル / ゲーム候補）の永続化
 * - 一時VC（参加者が全員退出したら消えるVC）の管理・自動削除
 */

// ── 選択肢の定義 ──────────────────────────────────────────────────────────
export const DEFAULT_GAMES = ['GGST', 'GGST（Switch）', 'スト６', 'シャドバ', 'デュエプレ', 'TRPG', '雀魂'];

// ゲームの「その他（手動入力）」を表すセンチネル値
export const CUSTOM_GAME_VALUE = '__custom__';

export interface Option {
  value: string;
  label: string;
  description?: string;
}

export const COUNT_OPTIONS: Option[] = [
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `${n}人` })),
  { value: '0', label: '無制限' },
];

export const AUDIENCE_OPTIONS: Option[] = [
  { value: 'all', label: '制限なし', description: 'どなたでも歓迎' },
  { value: 'regular', label: 'イツメン', description: '常連さん向け' },
  { value: 'newcomer', label: 'サーバー初心者', description: 'サーバーに来て間もない方向け' },
];

export const RANK_OPTIONS: Option[] = [
  { value: 'none', label: '制限なし' },
  { value: 'gold', label: 'ゴールド以下' },
  { value: 'platinum', label: 'プラチナ以下' },
  { value: 'diamond', label: 'ダイヤ以下' },
];

export function countLabel(value: string): string {
  return COUNT_OPTIONS.find((o) => o.value === value)?.label ?? `${value}人`;
}
export function audienceLabel(value: string): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === value)?.label ?? '制限なし';
}
export function rankLabel(value: string): string {
  return RANK_OPTIONS.find((o) => o.value === value)?.label ?? '制限なし';
}

// ── 設定（system_settings に guild 単位で保存） ─────────────────────────────
const CATEGORY_KEY = (guildId: string) => `vc_recruit_category:${guildId}`;
const NOTIFY_KEY = (guildId: string) => `vc_recruit_notify:${guildId}`;
const GAMES_KEY = (guildId: string) => `vc_recruit_games:${guildId}`;

export async function getCategoryId(guildId: string): Promise<string | null> {
  return SystemSettingModel.get(CATEGORY_KEY(guildId));
}

export async function setCategoryId(guildId: string, categoryId: string): Promise<void> {
  await SystemSettingModel.set(CATEGORY_KEY(guildId), categoryId);
}

/** 募集通知（作成された募集を投稿する）チャンネル */
export async function getNotifyChannelId(guildId: string): Promise<string | null> {
  return SystemSettingModel.get(NOTIFY_KEY(guildId));
}

export async function setNotifyChannelId(guildId: string, channelId: string): Promise<void> {
  await SystemSettingModel.set(NOTIFY_KEY(guildId), channelId);
}

/** 保存済みゲーム候補を取得（未設定ならデフォルトを返す） */
export async function getGames(guildId: string): Promise<string[]> {
  const raw = await SystemSettingModel.get(GAMES_KEY(guildId));
  if (!raw) return [...DEFAULT_GAMES];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.every((v) => typeof v === 'string')) {
      return arr as string[];
    }
  } catch {
    // 壊れていたらデフォルトにフォールバック
  }
  return [...DEFAULT_GAMES];
}

/** ゲーム候補を追加（重複・空白は無視）。追加されたら true。 */
export async function addGame(guildId: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const games = await getGames(guildId);
  // 大文字小文字・全角半角までは見ない素朴な重複チェック
  if (games.some((g) => g === trimmed)) return false;
  // Discord のセレクトは最大25件。ウィザードは末尾に「その他」を足すため
  // 候補は24件までに制限し、上限に達していたら古いものを1つ落とす。
  const next = [...games, trimmed];
  while (next.length > 24) next.shift();
  await SystemSettingModel.set(GAMES_KEY(guildId), JSON.stringify(next));
  return true;
}

/** ゲーム候補を削除。削除できたら true。 */
export async function removeGame(guildId: string, name: string): Promise<boolean> {
  const games = await getGames(guildId);
  const next = games.filter((g) => g !== name);
  if (next.length === games.length) return false;
  await SystemSettingModel.set(GAMES_KEY(guildId), JSON.stringify(next));
  return true;
}

// ── 一時VCの管理 ────────────────────────────────────────────────────────
export async function registerTempChannel(params: {
  channelId: string;
  guildId: string;
  creatorId: string;
  announceChannelId?: string | null;
  announceMessageId?: string | null;
}): Promise<void> {
  const db = getDatabase();
  await db.execute({
    sql: `
      INSERT OR REPLACE INTO temp_voice_channels
        (channel_id, guild_id, creator_id, announce_channel_id, announce_message_id, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    args: [
      params.channelId,
      params.guildId,
      params.creatorId,
      params.announceChannelId ?? null,
      params.announceMessageId ?? null,
    ],
  });
}

interface TempChannelRow {
  channel_id: string;
  guild_id: string;
  creator_id: string;
  announce_channel_id: string | null;
  announce_message_id: string | null;
}

async function getTempChannel(channelId: string): Promise<TempChannelRow | null> {
  const db = getDatabase();
  const res = await db.execute({
    sql: 'SELECT * FROM temp_voice_channels WHERE channel_id = ?',
    args: [channelId],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0] as any;
  return {
    channel_id: String(r.channel_id),
    guild_id: String(r.guild_id),
    creator_id: String(r.creator_id),
    announce_channel_id: r.announce_channel_id ? String(r.announce_channel_id) : null,
    announce_message_id: r.announce_message_id ? String(r.announce_message_id) : null,
  };
}

async function deleteTempChannelRow(channelId: string): Promise<void> {
  const db = getDatabase();
  await db.execute({
    sql: 'DELETE FROM temp_voice_channels WHERE channel_id = ?',
    args: [channelId],
  });
}

async function getAllTempChannels(): Promise<TempChannelRow[]> {
  const db = getDatabase();
  const res = await db.execute({ sql: 'SELECT * FROM temp_voice_channels' });
  return res.rows.map((r: any) => ({
    channel_id: String(r.channel_id),
    guild_id: String(r.guild_id),
    creator_id: String(r.creator_id),
    announce_channel_id: r.announce_channel_id ? String(r.announce_channel_id) : null,
    announce_message_id: r.announce_message_id ? String(r.announce_message_id) : null,
  }));
}

/** 募集告知メッセージを「終了」表示に更新する（失敗は無視）。 */
async function markAnnouncementClosed(
  client: Client,
  row: TempChannelRow,
): Promise<void> {
  if (!row.announce_channel_id || !row.announce_message_id) return;
  try {
    const ch = await client.channels.fetch(row.announce_channel_id);
    if (!ch || !ch.isTextBased()) return;
    const msg = await ch.messages.fetch(row.announce_message_id);
    const original = msg.embeds[0];
    const closed = EmbedBuilder.from(original ?? new EmbedBuilder())
      .setColor(0x9aa0a6)
      .setTitle('🔒 募集終了（VCは解散しました）');
    await msg.edit({ embeds: [closed], components: [] });
  } catch {
    // メッセージが消えている等は無視
  }
}

/**
 * 一時VCが空になっていれば削除する。削除したら true。
 */
async function deleteIfEmpty(channel: VoiceBasedChannel): Promise<boolean> {
  const row = await getTempChannel(channel.id);
  if (!row) return false; // 管理対象外
  if (channel.members.size > 0) return false; // まだ人がいる

  try {
    await channel.delete('簡易VC募集: 参加者が全員退出したため自動削除');
  } catch {
    // 既に消えている場合など
  }
  await deleteTempChannelRow(channel.id);
  await markAnnouncementClosed(channel.client, row);
  return true;
}

/**
 * voiceStateUpdate から呼ぶ。
 * - 一時VCが空になったら自動削除
 */
export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  // 退出元が一時VCなら空チェック
  if (oldState.channel && oldState.channelId !== newState.channelId) {
    try {
      await deleteIfEmpty(oldState.channel);
    } catch (e) {
      console.error('[VoiceRecruit] deleteIfEmpty error:', e);
    }
  }
}

/**
 * VC作成直後に呼ぶ。一定時間後にまだ誰も入っていなければ削除する保険。
 * （募集主が結局VCに入らなかったケースの掃除）
 */
export function scheduleEmptyGuard(channel: VoiceChannel, delayMs = 3 * 60 * 1000): void {
  setTimeout(async () => {
    try {
      const fresh = await channel.guild.channels.fetch(channel.id).catch(() => null);
      if (fresh && fresh.type === ChannelType.GuildVoice) {
        await deleteIfEmpty(fresh as VoiceChannel);
      }
    } catch {
      // 無視
    }
  }, delayMs).unref?.();
}

/**
 * 起動時に一時VCを掃除する。
 * - チャンネルが既に無い → 行だけ削除
 * - 空になっている → チャンネルとともに削除
 * （Bot再起動中に全員退出したVCが残るのを防ぐ）
 */
export async function sweepTempChannels(client: Client): Promise<void> {
  let rows: TempChannelRow[];
  try {
    rows = await getAllTempChannels();
  } catch (e) {
    console.error('[VoiceRecruit] sweepTempChannels load error:', e);
    return;
  }

  for (const row of rows) {
    try {
      const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
      if (!guild) {
        await deleteTempChannelRow(row.channel_id);
        continue;
      }
      const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        await deleteTempChannelRow(row.channel_id);
        await markAnnouncementClosed(client, row);
        continue;
      }
      await deleteIfEmpty(channel as VoiceChannel);
    } catch (e) {
      console.error(`[VoiceRecruit] sweep error for ${row.channel_id}:`, e);
    }
  }
}
