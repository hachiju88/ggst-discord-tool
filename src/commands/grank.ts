import {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  ModalSubmitInteraction,
  GuildMember,
} from 'discord.js';
import { RankTrackingService } from '../services/RankTrackingService';
import { PuddleFarmService } from '../services/PuddleFarmService';
import { buildPanel } from '../services/RankPanelBuilder';

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

  // Auto-register channel on first use
  const config = await RankTrackingService.getPostConfig(guildId);
  if (!config) {
    await RankTrackingService.setPostConfig(guildId, interaction.channelId);
  }

  await interaction.deferReply();

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
          .setMaxLength(3)
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
            .setDescription(`登録者: <@${tp.added_by_discord_id}>`)
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
    const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);
    const payload = await buildPanel({ guildId, days, filterByDiscordId: interaction.user.id });
    if (isEphemeral) {
      await interaction.update({ ...payload, attachments: [] });
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (action === 'setchannel') {
    const member = interaction.member as GuildMember | null;
    if (!member?.permissions.has('ManageGuild')) {
      await interaction.reply({ content: '❌ このボタンはサーバー管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId('grank:setchannel:select')
      .setPlaceholder('投稿先チャンネルを選択')
      .setChannelTypes(ChannelType.GuildText);
    await interaction.reply({
      content: '自動投稿先チャンネルを選択してください:',
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

// ─── String select handler ────────────────────────────────────────────────────

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const guildId = interaction.guildId;
  if (!guildId) return;

  // grank:remove:select
  if (parts[1] === 'remove' && parts[2] === 'select') {
    const trackId = parseInt(interaction.values[0], 10);
    const tp = await RankTrackingService.getTracking(trackId);
    if (!tp) {
      await interaction.update({ content: '❌ 対象が見つかりません。', components: [] });
      return;
    }
    const member = interaction.member as GuildMember | null;
    const canRemove =
      interaction.user.id === tp.added_by_discord_id ||
      member?.permissions.has('ManageGuild');
    if (!canRemove) {
      await interaction.update({ content: '❌ 解除できるのは登録した本人またはサーバー管理者のみです。', components: [] });
      return;
    }
    await RankTrackingService.removeTracking(trackId);
    await interaction.update({
      content: `✅ **${tp.display_name}** (${tp.char_short}) の追跡を解除しました。`,
      components: [],
    });
    return;
  }

  // grank-add:select:<char_short>
  if (interaction.customId.startsWith('grank-add:select:')) {
    const charShort = parts[2].toUpperCase();
    const playerId = parseInt(interaction.values[0], 10);
    await interaction.deferUpdate();

    const player = await PuddleFarmService.getPlayer(playerId);
    if (!player) {
      await interaction.editReply({ content: '❌ プレイヤー情報の取得に失敗しました。', components: [] });
      return;
    }
    const charInfo = player.ratings.find(r => r.char_short.toUpperCase() === charShort);
    const charLong = charInfo?.char_long ?? charShort;
    const result = await RankTrackingService.addTracking(
      guildId, playerId, player.name, charShort, charLong, interaction.user.id,
    );
    if (result === 'duplicate') {
      await interaction.editReply({ content: `ℹ️ **${player.name}** (${charShort}) はすでに追跡中です。`, components: [] });
      return;
    }
    await interaction.editReply({
      content: `✅ **${player.name}** (${charLong}) を追加しました。🔄ボタンで反映されます。`,
      components: [],
    });
    RankTrackingService.backfillPlayer(playerId, charShort).catch(console.error);
    return;
  }
}

// ─── Channel select handler ───────────────────────────────────────────────────

export async function handleChannelSelectMenu(interaction: ChannelSelectMenuInteraction): Promise<void> {
  if (!interaction.customId.startsWith('grank:setchannel:select')) return;
  const guildId = interaction.guildId;
  if (!guildId) return;

  const channel = interaction.values[0];
  await RankTrackingService.setPostConfig(guildId, channel);
  await interaction.update({
    content: `✅ 自動投稿先を <#${channel}> に設定しました。`,
    components: [],
  });
}

// ─── Modal submit handler ─────────────────────────────────────────────────────

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.customId.startsWith('grank-add:modal')) return;
  const guildId = interaction.guildId;
  if (!guildId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const count = await RankTrackingService.getGuildTrackingCount(guildId);
  if (count >= MAX_TRACKED_PER_GUILD) {
    await interaction.editReply({ content: `❌ 追跡上限 (${MAX_TRACKED_PER_GUILD}件) に達しています。先に不要なプレイヤーを解除してください。` });
    return;
  }

  const searchString = interaction.fields.getTextInputValue('search_string').trim();
  const charShort = interaction.fields.getTextInputValue('char_short').trim().toUpperCase();

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
    const result = await RankTrackingService.addTracking(
      guildId, r.id, r.name, charShort, r.char_long, interaction.user.id,
    );
    if (result === 'duplicate') {
      await interaction.editReply({ content: `ℹ️ **${r.name}** (${charShort}) はすでに追跡中です。` });
      return;
    }
    await interaction.editReply({
      content: `✅ **${r.name}** (${r.char_long}) を追加しました。🔄ボタンで反映されます。`,
    });
    RankTrackingService.backfillPlayer(r.id, charShort).catch(console.error);
    return;
  }

  // Multiple hits — show select menu
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

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}
