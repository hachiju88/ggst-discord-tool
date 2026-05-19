import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  GuildMember,
} from 'discord.js';
import { RankTrackingService } from '../services/RankTrackingService';
import { PuddleFarmService } from '../services/PuddleFarmService';
import { buildPanel } from '../services/RankPanelBuilder';
import { truncate } from '../utils/text';

function formatBackfillResult(
  name: string,
  charLong: string,
  result: { count: number; error?: string },
): string {
  if (result.error) {
    return `✅ **${name}** を追加しました。\n⚠️ 履歴取得に失敗しました(${result.error})。後ほどパネルの🔄で再取得できます。`;
  }
  if (result.count === 0) {
    return `✅ **${name}** を追加しました。\n⚠️ puddle.farm に履歴データがありませんでした(非公開アカウント・未プレイ・ID 不正の可能性)。`;
  }
  return `✅ **${name}** (${charLong}) を追加し、**${result.count}件**の履歴を取得しました。\n元のパネルの「🔄 更新」を押すと反映されます。`;
}

// StringSelectMenu の選択肢上限は25件のため、追跡上限もそれに合わせる。
const MAX_TRACKED_PER_GUILD = 25;

export const data = new SlashCommandBuilder()
  .setName('grank')
  .setDescription('[GGST] ランク追跡パネルを表示します');

// ─── /grank execute ───────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  // 自動投稿先チャンネルの設定は ManageGuild 権限を持つメンバーがコマンドを
  // 走らせたときだけ上書きする。閲覧目的の一般ユーザーが /grank を別チャンネルで
  // 実行しても投稿先は変わらない。
  const member = interaction.member as GuildMember | null;
  const isAdmin = !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
  if (isAdmin) {
    await RankTrackingService.setPostConfig(guildId, interaction.channelId);
  }

  const channel = interaction.channel;
  const channelName = channel && 'name' in channel ? `#${channel.name}` : undefined;
  const payload = await buildPanel({ guildId, days: 7, channelName });
  await interaction.editReply({ ...payload, attachments: [] });
}

// ─── Button handler ───────────────────────────────────────────────────────────

export async function handleButtonInteract(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const guildId = interaction.guildId;
  if (!guildId) return;

  if (action === 'refresh') {
    const days = parseInt(parts[2] ?? '7', 10);
    await interaction.deferUpdate();
    await RankTrackingService.fetchAndStoreAll(guildId);
    const payload = await buildPanel({ guildId, days });
    await interaction.editReply({ ...payload, attachments: [] });
    return;
  }

  if (action === 'add') {
    const modal = new ModalBuilder()
      .setCustomId('grank-add:modal')
      .setTitle('ランク追跡プレイヤーを追加');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('search_string')
          .setLabel('puddle.farm の検索名')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setPlaceholder('例: まつえむ'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('char_short')
          .setLabel('キャラクター短縮コード (2文字)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(2)
          .setPlaceholder('例: SO, KY, MA, AX, CH, PO, FA, MI, ZA, RA, LE, NA, GI'),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === 'remove') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const tracked = await RankTrackingService.getGuildTracking(guildId);
    if (tracked.length === 0) {
      await interaction.editReply({ content: '追跡中のプレイヤーはいません。' });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId('grank:remove:select')
      .setPlaceholder('解除するプレイヤーを選択')
      .addOptions(
        tracked.map(tp =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${truncate(tp.display_name, 20)} (${tp.char_short})`)
            .setDescription(`登録者: 本人または管理者のみ解除可`)
            .setValue(String(tp.id)),
        ),
      );
    await interaction.editReply({
      content: '解除するプレイヤーを選択してください:',
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
    return;
  }

  if (action === 'period') {
    const days = parseInt(parts[2] ?? '7', 10);
    await interaction.deferUpdate();
    const payload = await buildPanel({ guildId, days });
    await interaction.editReply({ ...payload, attachments: [] });
    return;
  }

  if (action === 'mine') {
    const days = parseInt(parts[2] ?? '7', 10);
    const isEphemeral = (interaction.message?.flags?.bitfield ?? 0) & MessageFlags.Ephemeral;
    const payload = await buildPanel({ guildId, days, filterByDiscordId: interaction.user.id });
    if (isEphemeral) {
      await interaction.update({ ...payload, attachments: [] });
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
    return;
  }
}

// ─── String select handler ────────────────────────────────────────────────────

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const guildId = interaction.guildId;
  if (!guildId) return;

  // grank:remove:select
  if (parts[0] === 'grank' && parts[1] === 'remove' && parts[2] === 'select') {
    const trackId = parseInt(interaction.values[0], 10);
    const tp = await RankTrackingService.getTracking(trackId);
    if (!tp) {
      await interaction.update({ content: '❌ 対象が見つかりません。', components: [] });
      return;
    }
    const member = interaction.member as GuildMember | null;
    const canRemove =
      interaction.user.id === tp.added_by_discord_id ||
      member?.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!canRemove) {
      await interaction.update({
        content: '❌ 解除できるのは登録した本人またはサーバー管理者のみです。',
        components: [],
      });
      return;
    }
    await RankTrackingService.removeTracking(trackId);
    await interaction.update({
      content: `✅ **${tp.display_name}** (${tp.char_short}) の追跡を解除しました。\n元のパネルの「🔄 更新」を押すと反映されます。`,
      components: [],
    });
    return;
  }

  // grank-add:select:<char_short>
  if (interaction.customId.startsWith('grank-add:select:')) {
    const charShortFromId = parts[2].toUpperCase();
    const playerId = interaction.values[0]; // string (int64 だと Number化で精度欠損するため)
    await interaction.deferUpdate();

    const player = await PuddleFarmService.getPlayer(playerId);
    if (!player) {
      await interaction.editReply({ content: '❌ プレイヤー情報の取得に失敗しました。', components: [] });
      return;
    }
    const charInfo = player.ratings.find(r => r.char_short.toUpperCase() === charShortFromId);
    if (!charInfo) {
      await interaction.editReply({
        content: `❌ ${player.name} は ${charShortFromId} の使用記録がありません。`,
        components: [],
      });
      return;
    }
    // puddle.farm が返す char_short の表記をそのまま保存(URL生成・履歴取得時の整合性のため)。
    const canonicalCharShort = charInfo.char_short;
    const result = await RankTrackingService.addTracking(
      guildId, playerId, player.name, canonicalCharShort, charInfo.char_long, interaction.user.id,
    );
    if (result === 'duplicate') {
      await interaction.editReply({
        content: `ℹ️ **${player.name}** (${canonicalCharShort}) はすでに追跡中です。`,
        components: [],
      });
      return;
    }
    await interaction.editReply({
      content: `✅ **${player.name}** (${charInfo.char_long}) を追加しました。\n⏳ 90日分の履歴を取得中...`,
      components: [],
    });
    const backfill = await RankTrackingService.backfillPlayer(playerId, canonicalCharShort);
    await interaction.editReply({
      content: formatBackfillResult(player.name, charInfo.char_long, backfill),
      components: [],
    });
    return;
  }
}

// ─── Modal submit handler ─────────────────────────────────────────────────────

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.customId.startsWith('grank-add:modal')) return;
  const guildId = interaction.guildId;
  if (!guildId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const count = await RankTrackingService.getGuildTrackingCount(guildId);
  if (count >= MAX_TRACKED_PER_GUILD) {
    await interaction.editReply({
      content: `❌ 追跡上限 (${MAX_TRACKED_PER_GUILD}件) に達しています。先に不要なプレイヤーを解除してください。`,
    });
    return;
  }

  const searchString = interaction.fields.getTextInputValue('search_string').trim();
  const charShort = interaction.fields.getTextInputValue('char_short').trim().toUpperCase();

  if (searchString.length === 0) {
    await interaction.editReply({ content: '❌ 検索名を入力してください。' });
    return;
  }
  if (charShort.length !== 2) {
    await interaction.editReply({ content: '❌ キャラクター短縮コードは2文字で指定してください (例: SO, KY)。' });
    return;
  }

  const results = await PuddleFarmService.searchPlayer(searchString);
  const filtered = results.filter(r => r.char_short.toUpperCase() === charShort);

  if (filtered.length === 0) {
    const available = [...new Set(results.map(r => r.char_short))].join(', ');
    const hint = available ? `\n見つかったキャラ: \`${available}\`` : '';
    await interaction.editReply({
      content: `❌ **${searchString}** で \`${charShort}\` のプレイヤーが見つかりませんでした。${hint}`,
    });
    return;
  }

  if (filtered.length === 1) {
    const r = filtered[0];
    // API の char_short 表記を保存。
    const result = await RankTrackingService.addTracking(
      guildId, r.id, r.name, r.char_short, r.char_long, interaction.user.id,
    );
    if (result === 'duplicate') {
      await interaction.editReply({ content: `ℹ️ **${r.name}** (${r.char_short}) はすでに追跡中です。` });
      return;
    }
    await interaction.editReply({
      content: `✅ **${r.name}** (${r.char_long}) を追加しました。\n⏳ 90日分の履歴を取得中...`,
    });
    const backfill = await RankTrackingService.backfillPlayer(r.id, r.char_short);
    await interaction.editReply({
      content: formatBackfillResult(r.name, r.char_long, backfill),
    });
    return;
  }

  // 候補が複数ヒット — Select menu に逃がす。
  const options = filtered.slice(0, 25).map(r =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncate(r.name, 25))
      .setDescription(`Rating: ${r.rating.toFixed(0)}`)
      .setValue(String(r.id)),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`grank-add:select:${charShort}`)
    .setPlaceholder('登録するプレイヤーを選択')
    .addOptions(options);
  await interaction.editReply({
    content: `**${searchString}** (${charShort}) の検索結果が複数見つかりました。登録するプレイヤーを選択してください:`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}
