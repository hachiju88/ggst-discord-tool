import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { Client, Channel } from 'discord.js';
import { RankTrackingService, type TrackedPlayer } from './RankTrackingService';
import { characterDisplayName } from '../constants/puddle-characters';
import { truncate, escapeMarkdown } from '../utils/text';

// puddle.farm 側の制限で EC2 からの API アクセスが 403 になり、レート追跡が
// できなくなったため、/grank は「登録プレイヤーの puddle.farm ページへのリンク集」
// として提供する。旧レート追跡パネル(RankPanelBuilder / RankGraphService /
// RankScheduler)は復活に備えてコードを残している。

export type LinkPanelPayload = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

// Discord の制約: 1メッセージ最大5行 × 1行最大5ボタン。
// 最終行は操作ボタン(追加/解除)に使うため、リンクボタンは最大20個。
const MAX_LINK_BUTTONS = 20;
const BUTTONS_PER_ROW = 5;
const BUTTON_LABEL_MAX = 80;

export function puddlePlayerUrl(tp: Pick<TrackedPlayer, 'puddle_player_id' | 'char_short'>): string {
  return `https://puddle.farm/player/${tp.puddle_player_id}/${tp.char_short}`;
}

// ボタンテキスト: 「ユーザー名 / キャラクター名(正式名)」
export function linkButtonLabel(tp: Pick<TrackedPlayer, 'display_name' | 'char_short' | 'char_long'>): string {
  const charName = characterDisplayName(tp.char_short, tp.char_long);
  return truncate(`${tp.display_name} / ${charName}`, BUTTON_LABEL_MAX);
}

export async function buildLinkPanel(guildId: string): Promise<LinkPanelPayload> {
  const tracked = await RankTrackingService.getGuildTracking(guildId);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔗 puddle.farm プレイヤーリンク');

  const linkRows: ActionRowBuilder<ButtonBuilder>[] = [];
  const buttonPlayers = tracked.slice(0, MAX_LINK_BUTTONS);
  for (let i = 0; i < buttonPlayers.length; i += BUTTONS_PER_ROW) {
    linkRows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttonPlayers.slice(i, i + BUTTONS_PER_ROW).map(tp =>
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(linkButtonLabel(tp))
            .setURL(puddlePlayerUrl(tp)),
        ),
      ),
    );
  }

  const lines: string[] = [];
  if (tracked.length === 0) {
    lines.push('登録されているプレイヤーはいません。');
    lines.push('**➕ 追加** ボタンから puddle.farm のプレイヤーを登録してください。');
  } else {
    lines.push('ボタンを押すと puddle.farm のプレイヤーページが開きます。');
  }
  // ボタン枠に収まらない分はテキストリンクで表示
  const overflow = tracked.slice(MAX_LINK_BUTTONS);
  if (overflow.length > 0) {
    lines.push('');
    for (const tp of overflow) {
      lines.push(`• [${escapeMarkdown(linkButtonLabel(tp))}](${puddlePlayerUrl(tp)})`);
    }
  }
  embed.setDescription(lines.join('\n'));

  const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('grank:add').setLabel('➕ 追加').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('grank:remove').setLabel('➖ 解除').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [...linkRows, controlRow] };
}

// パネルを投稿・編集できるサーバー内のテキスト系チャンネル(通常/アナウンス/スレッド/
// ボイスチャンネルのテキストチャット等)を取得する。
type PanelChannel = Extract<Channel, { send: unknown; messages: unknown }>;

async function fetchPanelChannel(client: Client, channelId: string): Promise<PanelChannel | null> {
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased() && !ch.isDMBased()) return ch as PanelChannel;
  } catch {
    // 権限なし・削除済みなど
  }
  return null;
}

// 同一サーバーでのパネル差し替え・登録処理を直列化する(同時追加で古いパネルが
// 取り残されたり、登録上限を超えたりする競合を防ぐ)。単一プロセス前提のメモリ内ロック。
const guildQueues = new Map<string, Promise<unknown>>();

export function runExclusive<T>(guildId: string, task: () => Promise<T>): Promise<T> {
  const prev = guildQueues.get(guildId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  const tail = next.catch(() => undefined);
  guildQueues.set(guildId, tail);
  void tail.then(() => {
    if (guildQueues.get(guildId) === tail) guildQueues.delete(guildId);
  });
  return next;
}

// 「現在のパネル」を newMessage に差し替える: 先に新しいパネルを記録してから
// 古いパネルを削除する(削除だけ成功してパネルが消える事態を避けるため)。
export async function replacePanelMessage(
  client: Client,
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const old = await RankTrackingService.getPostConfig(guildId);
  await RankTrackingService.setPanelMessage(guildId, channelId, messageId);
  if (old?.message_id && old.message_id !== messageId) {
    const oldChannel = await fetchPanelChannel(client, old.channel_id);
    await oldChannel?.messages.delete(old.message_id).catch(() => { /* 削除済み等は無視 */ });
  }
}

// 最新のパネルを投稿し直し、前回のパネルを削除する(新規追加時に使用)。
// 投稿先は登録済みの投稿先チャンネル、未設定/投稿不可なら fallbackChannelId。
// 呼び出し側で runExclusive の中から呼ぶこと。
export async function repostLinkPanel(client: Client, guildId: string, fallbackChannelId?: string): Promise<boolean> {
  const config = await RankTrackingService.getPostConfig(guildId);

  let channel = config ? await fetchPanelChannel(client, config.channel_id) : null;
  if (!channel && fallbackChannelId) channel = await fetchPanelChannel(client, fallbackChannelId);
  if (!channel) return false;

  const payload = await buildLinkPanel(guildId);
  const message = await channel.send(payload);
  await replacePanelMessage(client, guildId, channel.id, message.id);
  return true;
}

// 記録済みのパネルをその場で更新する(解除時に使用。再投稿はしない)。
export async function refreshLinkPanel(client: Client, guildId: string): Promise<boolean> {
  const config = await RankTrackingService.getPostConfig(guildId);
  if (!config?.message_id) return false;
  const channel = await fetchPanelChannel(client, config.channel_id);
  if (!channel) return false;
  try {
    const message = await channel.messages.fetch(config.message_id);
    const payload = await buildLinkPanel(guildId);
    await message.edit({ ...payload, files: [], attachments: [] });
    return true;
  } catch {
    return false;
  }
}
