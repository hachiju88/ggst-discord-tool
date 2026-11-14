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
import { buildLinkPanel, repostLinkPanel, refreshLinkPanel, linkButtonLabel } from '../services/LinkPanelService';
import {
  PUDDLE_CHARACTERS,
  characterDisplayName,
  isPuddleCharCode,
  parsePuddlePlayerInput,
} from '../constants/puddle-characters';
import { truncate } from '../utils/text';

// ─────────────────────────────────────────────────────────────────────────────
// /grank は現在「puddle.farm プレイヤーリンク集」として動作する。
//
// puddle.farm が EC2(AWS)からの API アクセスを 403 で拒否するようになり、
// レート取得・検索ができなくなったため、レート追跡(グラフ・24h変動・毎時取得・
// 日次投稿)は停止中。復活に備えて旧実装はこのファイル末尾にコメントアウトで残し、
// 関連サービス(RankPanelBuilder / RankGraphService / RankScheduler /
// PuddleFarmService)もそのまま残している。
//
// 登録は puddle.farm の API を使わず、プレイヤーページの URL と表示名を
// 手入力してもらう方式。パネルは新規追加時のみ再投稿する。
// ─────────────────────────────────────────────────────────────────────────────

// Discord の制約(ボタン20個 + 解除メニュー25件)に合わせた登録上限。
// 20件を超えた分はパネル上でテキストリンクとして表示される。
const MAX_TRACKED_PER_GUILD = 25;

const STOPPED_NOTICE =
  'ℹ️ puddle.farm 側の制限により、レート追跡(グラフ・更新・期間切替)は現在停止しています。\n' +
  '`/grank` で新しいリンクパネルを表示してください。';

export const data = new SlashCommandBuilder()
  .setName('grank')
  .setDescription('[GGST] puddle.farm のプレイヤーリンク一覧を表示します');

// ─── /grank execute ───────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();
  const payload = await buildLinkPanel(guildId);
  const message = await interaction.editReply(payload);

  // 管理者が実行した場合(または投稿先が未設定の場合)は、このメッセージを
  // 「現在のパネル」として記録する。新規追加時はこのチャンネルに再投稿され、
  // 記録済みの古いパネルは削除される。閲覧目的の一般ユーザーの実行では変えない。
  const member = interaction.member as GuildMember | null;
  const isAdmin = !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
  const config = await RankTrackingService.getPostConfig(guildId);
  if (isAdmin || !config) {
    if (config?.message_id && config.message_id !== message.id) {
      const oldChannel = await interaction.client.channels.fetch(config.channel_id).catch(() => null);
      if (oldChannel && 'messages' in oldChannel) {
        await oldChannel.messages.delete(config.message_id).catch(() => { /* 削除済み等は無視 */ });
      }
    }
    await RankTrackingService.setPanelMessage(guildId, interaction.channelId, message.id);
  }
}

// ─── Button handler ───────────────────────────────────────────────────────────

export async function handleButtonInteract(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const guildId = interaction.guildId;
  if (!guildId) return;

  if (action === 'add') {
    const modal = new ModalBuilder()
      .setCustomId('grank-add:modal')
      .setTitle('puddle.farm プレイヤーを追加');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('player_url')
          .setLabel('puddle.farm のプレイヤーページURL')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
          .setPlaceholder('例: https://puddle.farm/player/210808125103331848/GI'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('display_name')
          .setLabel('ユーザー名(ボタンに表示されます)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
          .setPlaceholder('例: まつえむ'),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('char_short')
          .setLabel('キャラ略称(URL末尾にあれば入力不要)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(2)
          .setPlaceholder('例: SO, KY, GI, NA, RA'),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === 'remove') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const tracked = await RankTrackingService.getGuildTracking(guildId);
    if (tracked.length === 0) {
      await interaction.editReply({ content: '登録されているプレイヤーはいません。' });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId('grank:remove:select')
      .setPlaceholder('解除するプレイヤーを選択')
      .addOptions(
        tracked.slice(0, 25).map(tp =>
          new StringSelectMenuOptionBuilder()
            .setLabel(truncate(linkButtonLabel(tp), 100))
            .setDescription('登録者: 本人または管理者のみ解除可')
            .setValue(String(tp.id)),
        ),
      );
    await interaction.editReply({
      content: '解除するプレイヤーを選択してください:',
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
    return;
  }

  // 旧レート追跡パネルのボタン(🔄更新 / 期間切替 / 自分のみ)。停止中である旨を返す。
  if (action === 'refresh' || action === 'period' || action === 'mine') {
    await interaction.reply({ content: STOPPED_NOTICE, flags: MessageFlags.Ephemeral });
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
    if (!tp || tp.guild_id !== guildId) {
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
    // 解除時は再投稿せず、既存パネルをその場で更新する
    const refreshed = await refreshLinkPanel(interaction.client, guildId).catch(() => false);
    await interaction.update({
      content: `✅ **${linkButtonLabel(tp)}** を解除しました。` +
        (refreshed ? '\nパネルを更新しました。' : '\n`/grank` でパネルを表示し直してください。'),
      components: [],
    });
    return;
  }

  // 旧: 検索結果からの選択(puddle.farm 検索は停止中)
  if (interaction.customId.startsWith('grank-add:select:')) {
    await interaction.update({ content: STOPPED_NOTICE, components: [] });
    return;
  }
}

// ─── Modal submit handler ─────────────────────────────────────────────────────

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.customId.startsWith('grank-add:modal')) return;
  const guildId = interaction.guildId;
  if (!guildId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let alreadyAdded = false;
  try {
    const count = await RankTrackingService.getGuildTrackingCount(guildId);
    if (count >= MAX_TRACKED_PER_GUILD) {
      await interaction.editReply({
        content: `❌ 登録上限 (${MAX_TRACKED_PER_GUILD}件) に達しています。先に不要なプレイヤーを解除してください。`,
      });
      return;
    }

    const rawUrl = interaction.fields.getTextInputValue('player_url');
    const displayName = interaction.fields.getTextInputValue('display_name').trim();
    const rawChar = (interaction.fields.getTextInputValue('char_short') ?? '').trim().toUpperCase();

    const parsed = parsePuddlePlayerInput(rawUrl);
    if (!parsed) {
      await interaction.editReply({
        content: '❌ puddle.farm のプレイヤーページURLを入力してください。\n例: `https://puddle.farm/player/210808125103331848/GI`',
      });
      return;
    }
    if (displayName.length === 0) {
      await interaction.editReply({ content: '❌ ユーザー名を入力してください。' });
      return;
    }

    const charShort = parsed.charShort ?? rawChar;
    if (!charShort) {
      await interaction.editReply({
        content: '❌ キャラクターが分かりません。URL をキャラのページ(末尾が `/GI` など)にするか、キャラ略称を入力してください。',
      });
      return;
    }
    if (!isPuddleCharCode(charShort)) {
      const codes = Object.keys(PUDDLE_CHARACTERS).join(', ');
      await interaction.editReply({ content: `❌ キャラ略称 \`${charShort}\` が不正です。\n使用できる略称: \`${codes}\`` });
      return;
    }

    const charName = characterDisplayName(charShort);
    const result = await RankTrackingService.addTracking(
      guildId, parsed.playerId, displayName, charShort, charName, interaction.user.id,
    );
    if (result === 'duplicate') {
      await interaction.editReply({ content: `ℹ️ このプレイヤー(${charName})はすでに登録されています。` });
      return;
    }
    alreadyAdded = true;

    // 新規追加時のみパネルを再投稿(古いパネルは削除)
    const reposted = await repostLinkPanel(interaction.client, guildId, interaction.channelId ?? undefined);
    await interaction.editReply({
      content: `✅ **${displayName} / ${charName}** を追加しました。` +
        (reposted ? '\nパネルを再投稿しました。' : '\n⚠️ パネルを投稿できませんでした。`/grank` で表示してください。'),
    });
  } catch (err) {
    console.error('[grank] modal submit failed:', err);
    const content = alreadyAdded
      ? '✅ 追加は完了しましたが、パネルの再投稿に失敗しました。`/grank` で表示してください。'
      : '❌ プレイヤーの追加中にエラーが発生しました。時間をおいて再度お試しください。';
    await interaction.editReply({ content }).catch(() => { /* 応答ずみ等は無視 */ });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 【停止中】旧レート追跡版 /grank の実装
// puddle.farm への API アクセスが復活したら、上の実装と差し替えて再利用する。
// 併せて src/index.ts の startScheduler(毎時取得・日次投稿)のコメントアウトも戻すこと。
// ═════════════════════════════════════════════════════════════════════════════
//
// import {
//   SlashCommandBuilder,
//   ModalBuilder,
//   TextInputBuilder,
//   TextInputStyle,
//   ActionRowBuilder,
//   StringSelectMenuBuilder,
//   StringSelectMenuOptionBuilder,
//   MessageFlags,
//   PermissionFlagsBits,
// } from 'discord.js';
// import type {
//   ChatInputCommandInteraction,
//   ButtonInteraction,
//   StringSelectMenuInteraction,
//   ModalSubmitInteraction,
//   GuildMember,
// } from 'discord.js';
// import { RankTrackingService } from '../services/RankTrackingService';
// import { PuddleFarmService, type SearchResult } from '../services/PuddleFarmService';
// import { buildPanel } from '../services/RankPanelBuilder';
// import { truncate } from '../utils/text';
// import { decodeRating } from '../constants/dr-ranks';
//
// // puddle.farm の検索は同一プレイヤー(同じ id)を複数行で返すことがある
// // (別名・名前履歴マッチなど)。同一キャラで絞り込んだ後にこれが残ると、
// // StringSelectMenu の option value(= player id)が重複し、Discord が
// // メニュー送信を 400 で拒否 → defer 済みインタラクションが無言で失敗する。
// // これを防ぐため id で重複排除する(最初の出現を採用)。
// // 【一時デバッグ用】原因調査のためエラー詳細を ephemeral メッセージに出す。
// // 本人にしか見えない ephemeral 応答なので情報漏洩リスクは低いが、原因特定後に
// // 呼び出し箇所ごと元のシンプルな文言へ戻すこと。
// function formatErrorDetail(err: unknown): string {
//   const name = err instanceof Error ? err.name : 'Error';
//   const msg = err instanceof Error ? err.message : String(err);
//   return `\n\`\`\`\n${truncate(`${name}: ${msg}`, 400)}\n\`\`\``;
// }
//
// function dedupById(results: SearchResult[]): SearchResult[] {
//   const seen = new Set<string>();
//   const out: SearchResult[] = [];
//   for (const r of results) {
//     const id = String(r.id);
//     if (seen.has(id)) continue;
//     seen.add(id);
//     out.push(r);
//   }
//   return out;
// }
//
// function formatBackfillResult(
//   name: string,
//   charLong: string,
//   result: { count: number; error?: string },
// ): string {
//   if (result.error) {
//     return `✅ **${name}** を追加しました。\n⚠️ 履歴取得に失敗しました(${truncate(result.error, 200)})。後ほどパネルの🔄で再取得できます。`;
//   }
//   if (result.count === 0) {
//     return `✅ **${name}** を追加しました。\n⚠️ puddle.farm に履歴データがありませんでした(非公開アカウント・未プレイ・ID 不正の可能性)。`;
//   }
//   return `✅ **${name}** (${charLong}) を追加し、**${result.count}件**の履歴を取得しました。\n元のパネルの「🔄 更新」を押すと反映されます。`;
// }
//
// // StringSelectMenu の選択肢上限は25件のため、追跡上限もそれに合わせる。
// const MAX_TRACKED_PER_GUILD = 25;
//
// export const data = new SlashCommandBuilder()
//   .setName('grank')
//   .setDescription('[GGST] ランク追跡パネルを表示します');
//
// // ─── /grank execute ───────────────────────────────────────────────────────────
//
// export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
//   const guildId = interaction.guildId;
//   if (!guildId) {
//     await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: MessageFlags.Ephemeral });
//     return;
//   }
//
//   await interaction.deferReply();
//
//   // 自動投稿先チャンネルの設定は ManageGuild 権限を持つメンバーがコマンドを
//   // 走らせたときだけ上書きする。閲覧目的の一般ユーザーが /grank を別チャンネルで
//   // 実行しても投稿先は変わらない。
//   const member = interaction.member as GuildMember | null;
//   const isAdmin = !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
//   if (isAdmin) {
//     await RankTrackingService.setPostConfig(guildId, interaction.channelId);
//   }
//
//   const channel = interaction.channel;
//   const channelName = channel && 'name' in channel ? `#${channel.name}` : undefined;
//   const payload = await buildPanel({ guildId, days: 7, channelName });
//   await interaction.editReply({ ...payload, attachments: [] });
// }
//
// // ─── Button handler ───────────────────────────────────────────────────────────
//
// export async function handleButtonInteract(interaction: ButtonInteraction): Promise<void> {
//   const parts = interaction.customId.split(':');
//   const action = parts[1];
//   const guildId = interaction.guildId;
//   if (!guildId) return;
//
//   if (action === 'refresh') {
//     const days = parseInt(parts[2] ?? '7', 10);
//     await interaction.deferUpdate();
//     await RankTrackingService.fetchAndStoreAll(guildId);
//     const payload = await buildPanel({ guildId, days });
//     await interaction.editReply({ ...payload, attachments: [] });
//     return;
//   }
//
//   if (action === 'add') {
//     const modal = new ModalBuilder()
//       .setCustomId('grank-add:modal')
//       .setTitle('ランク追跡プレイヤーを追加');
//     modal.addComponents(
//       new ActionRowBuilder<TextInputBuilder>().addComponents(
//         new TextInputBuilder()
//           .setCustomId('search_string')
//           .setLabel('puddle.farm の検索名')
//           .setStyle(TextInputStyle.Short)
//           .setRequired(true)
//           .setMaxLength(50)
//           .setPlaceholder('例: まつえむ'),
//       ),
//       new ActionRowBuilder<TextInputBuilder>().addComponents(
//         new TextInputBuilder()
//           .setCustomId('char_short')
//           .setLabel('キャラクター短縮コード (2文字)')
//           .setStyle(TextInputStyle.Short)
//           .setRequired(true)
//           .setMinLength(2)
//           .setMaxLength(2)
//           .setPlaceholder('例: SO, KY, MA, AX, CH, PO, FA, MI, ZA, RA, LE, NA, GI'),
//       ),
//     );
//     await interaction.showModal(modal);
//     return;
//   }
//
//   if (action === 'remove') {
//     await interaction.deferReply({ flags: MessageFlags.Ephemeral });
//     const tracked = await RankTrackingService.getGuildTracking(guildId);
//     if (tracked.length === 0) {
//       await interaction.editReply({ content: '追跡中のプレイヤーはいません。' });
//       return;
//     }
//     const menu = new StringSelectMenuBuilder()
//       .setCustomId('grank:remove:select')
//       .setPlaceholder('解除するプレイヤーを選択')
//       .addOptions(
//         tracked.map(tp =>
//           new StringSelectMenuOptionBuilder()
//             .setLabel(`${truncate(tp.display_name, 20)} (${tp.char_short})`)
//             .setDescription(`登録者: 本人または管理者のみ解除可`)
//             .setValue(String(tp.id)),
//         ),
//       );
//     await interaction.editReply({
//       content: '解除するプレイヤーを選択してください:',
//       components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
//     });
//     return;
//   }
//
//   if (action === 'period') {
//     const days = parseInt(parts[2] ?? '7', 10);
//     await interaction.deferUpdate();
//     const payload = await buildPanel({ guildId, days });
//     await interaction.editReply({ ...payload, attachments: [] });
//     return;
//   }
//
//   if (action === 'mine') {
//     const days = parseInt(parts[2] ?? '7', 10);
//     const isEphemeral = (interaction.message?.flags?.bitfield ?? 0) & MessageFlags.Ephemeral;
//     const payload = await buildPanel({ guildId, days, filterByDiscordId: interaction.user.id });
//     if (isEphemeral) {
//       await interaction.update({ ...payload, attachments: [] });
//     } else {
//       await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
//     }
//     return;
//   }
// }
//
// // ─── String select handler ────────────────────────────────────────────────────
//
// export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
//   const parts = interaction.customId.split(':');
//   const guildId = interaction.guildId;
//   if (!guildId) return;
//
//   // grank:remove:select
//   if (parts[0] === 'grank' && parts[1] === 'remove' && parts[2] === 'select') {
//     const trackId = parseInt(interaction.values[0], 10);
//     const tp = await RankTrackingService.getTracking(trackId);
//     if (!tp) {
//       await interaction.update({ content: '❌ 対象が見つかりません。', components: [] });
//       return;
//     }
//     const member = interaction.member as GuildMember | null;
//     const canRemove =
//       interaction.user.id === tp.added_by_discord_id ||
//       member?.permissions.has(PermissionFlagsBits.ManageGuild);
//     if (!canRemove) {
//       await interaction.update({
//         content: '❌ 解除できるのは登録した本人またはサーバー管理者のみです。',
//         components: [],
//       });
//       return;
//     }
//     await RankTrackingService.removeTracking(trackId);
//     await interaction.update({
//       content: `✅ **${tp.display_name}** (${tp.char_short}) の追跡を解除しました。\n元のパネルの「🔄 更新」を押すと反映されます。`,
//       components: [],
//     });
//     return;
//   }
//
//   // grank-add:select:<char_short>
//   if (interaction.customId.startsWith('grank-add:select:')) {
//     const charShortFromId = parts[2].toUpperCase();
//     const playerId = interaction.values[0]; // string (int64 だと Number化で精度欠損するため)
//     await interaction.deferUpdate();
//
//     // deferUpdate 済みのため、ここで例外が漏れると bot.ts のフォールバックが
//     // 走らず「選択したのに何も起きない」無言失敗になる。必ずここで捕捉して
//     // ユーザーへ結果を返す。
//     // addTracking 成功(DB登録済み)後の editReply が transient エラーで落ちた場合に
//     // 「追加失敗」と誤表示しないよう、登録済みかどうかを保持する。
//     let alreadyAdded = false;
//     try {
//       const player = await PuddleFarmService.getPlayer(playerId);
//       if (!player) {
//         await interaction.editReply({ content: '❌ プレイヤー情報の取得に失敗しました。', components: [] });
//         return;
//       }
//       const charInfo = player.ratings.find(r => r.char_short.toUpperCase() === charShortFromId);
//       if (!charInfo) {
//         await interaction.editReply({
//           content: `❌ ${player.name} は ${charShortFromId} の使用記録がありません。`,
//           components: [],
//         });
//         return;
//       }
//       // puddle.farm が返す char_short の表記をそのまま保存(URL生成・履歴取得時の整合性のため)。
//       const canonicalCharShort = charInfo.char_short;
//       // /player/{id} のキャラ名は API 上 `character` で、getPlayer が char_long に詰め替える。
//       // 念のため欠落時(undefined を bind すると libsql が throw する)は char_short で代替。
//       const canonicalCharLong = charInfo.char_long || canonicalCharShort;
//       const result = await RankTrackingService.addTracking(
//         guildId, playerId, player.name, canonicalCharShort, canonicalCharLong, interaction.user.id,
//       );
//       if (result === 'duplicate') {
//         await interaction.editReply({
//           content: `ℹ️ **${player.name}** (${canonicalCharShort}) はすでに追跡中です。`,
//           components: [],
//         });
//         return;
//       }
//       alreadyAdded = true;
//       await interaction.editReply({
//         content: `✅ **${player.name}** (${canonicalCharLong}) を追加しました。\n⏳ 履歴を取得中...`,
//         components: [],
//       });
//       const backfill = await RankTrackingService.backfillPlayer(playerId, canonicalCharShort, charInfo.rating);
//       await interaction.editReply({
//         content: formatBackfillResult(player.name, canonicalCharLong, backfill),
//         components: [],
//       });
//     } catch (err) {
//       console.error('[grank] add select failed:', err);
//       // 既に登録は完了しているケースでは「失敗」と断定しない(履歴取得は🔄で再取得可能)。
//       const content = alreadyAdded
//         ? '⚠️ 追加は完了しましたが、履歴取得の表示に失敗しました。パネルの🔄で反映されます。'
//         : `❌ プレイヤーの追加中にエラーが発生しました。時間をおいて再度お試しください。${formatErrorDetail(err)}`;
//       await interaction.editReply({ content, components: [] }).catch(() => { /* 応答ずみ等は無視 */ });
//     }
//     return;
//   }
// }
//
// // ─── Modal submit handler ─────────────────────────────────────────────────────
//
// export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
//   if (!interaction.customId.startsWith('grank-add:modal')) return;
//   const guildId = interaction.guildId;
//   if (!guildId) return;
//
//   await interaction.deferReply({ flags: MessageFlags.Ephemeral });
//
//   // deferReply 済みのため、以降で例外が漏れると bot.ts のフォールバックが走らず
//   // 「モーダル送信後に何も起きない」無言失敗になる。DB / 検索呼び出しの例外を
//   // 必ずここで捕捉してユーザーへ返す。
//   // addTracking 成功後の editReply が transient エラーで落ちた場合に「追加失敗」と
//   // 誤表示しないよう、登録済みかどうかを保持する。
//   let alreadyAdded = false;
//   try {
//     const count = await RankTrackingService.getGuildTrackingCount(guildId);
//     if (count >= MAX_TRACKED_PER_GUILD) {
//       await interaction.editReply({
//         content: `❌ 追跡上限 (${MAX_TRACKED_PER_GUILD}件) に達しています。先に不要なプレイヤーを解除してください。`,
//       });
//       return;
//     }
//
//     const searchString = interaction.fields.getTextInputValue('search_string').trim();
//     const charShort = interaction.fields.getTextInputValue('char_short').trim().toUpperCase();
//
//     if (searchString.length === 0) {
//       await interaction.editReply({ content: '❌ 検索名を入力してください。' });
//       return;
//     }
//     if (charShort.length !== 2) {
//       await interaction.editReply({ content: '❌ キャラクター短縮コードは2文字で指定してください (例: SO, KY)。' });
//       return;
//     }
//
//     const results = await PuddleFarmService.searchPlayer(searchString);
//     // char で絞り込んだ時点で各行は (プレイヤー, このchar) を表すため、id 重複排除で
//     // 同一プレイヤーの重複行を安全に除去できる(別 char は既に除外済み)。
//     const filtered = dedupById(results.filter(r => r.char_short.toUpperCase() === charShort));
//
//     if (filtered.length === 0) {
//       const available = [...new Set(results.map(r => r.char_short))].join(', ');
//       const hint = available ? `\n見つかったキャラ: \`${available}\`` : '';
//       await interaction.editReply({
//         content: `❌ **${searchString}** で \`${charShort}\` のプレイヤーが見つかりませんでした。${hint}`,
//       });
//       return;
//     }
//
//     if (filtered.length === 1) {
//       const r = filtered[0];
//       // API の char_short 表記を保存。char_long 欠落時は char_short で代替
//       // (undefined を bind すると libsql が throw するため)。
//       const result = await RankTrackingService.addTracking(
//         guildId, r.id, r.name, r.char_short, r.char_long || r.char_short, interaction.user.id,
//       );
//       if (result === 'duplicate') {
//         await interaction.editReply({ content: `ℹ️ **${r.name}** (${r.char_short}) はすでに追跡中です。` });
//         return;
//       }
//       alreadyAdded = true;
//       await interaction.editReply({
//         content: `✅ **${r.name}** (${r.char_long}) を追加しました。\n⏳ 履歴を取得中...`,
//       });
//       const backfill = await RankTrackingService.backfillPlayer(
//         r.id, r.char_short, typeof r.rating === 'number' ? r.rating : undefined,
//       );
//       await interaction.editReply({
//         content: formatBackfillResult(r.name, r.char_long, backfill),
//       });
//       return;
//     }
//
//     // 候補が複数ヒット — Select menu に逃がす。
//     // r.rating は型上 number だが API が null を返すケース(placement/未ランク)に
//     // 備えてガードする。decodeRating(null) は NaN を経由してクラッシュするため。
//     const options = filtered.slice(0, 25).map(r => {
//       let ratingLabel: string;
//       if (typeof r.rating === 'number' && Number.isFinite(r.rating)) {
//         const decoded = decodeRating(r.rating);
//         ratingLabel = decoded.kind === 'DR' ? `DR ${decoded.value.toFixed(0)}` : `RP ${decoded.value.toFixed(0)}`;
//       } else {
//         ratingLabel = 'レート不明';
//       }
//       // 同名・同キャラの別プレイヤーが並ぶことがあるため、ID を併記して
//       // 区別できるようにする(description は最大100文字)。
//       return new StringSelectMenuOptionBuilder()
//         .setLabel(truncate(r.name, 25))
//         .setDescription(truncate(`${ratingLabel} · ID ${r.id}`, 100))
//         .setValue(String(r.id));
//     });
//     const menu = new StringSelectMenuBuilder()
//       .setCustomId(`grank-add:select:${charShort}`)
//       .setPlaceholder('登録するプレイヤーを選択')
//       .addOptions(options);
//     await interaction.editReply({
//       content: `**${searchString}** (${charShort}) の検索結果が複数見つかりました。登録するプレイヤーを選択してください:`,
//       components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
//     });
//   } catch (err) {
//     console.error('[grank] modal submit failed:', err);
//     const content = alreadyAdded
//       ? '⚠️ 追加は完了しましたが、履歴取得の表示に失敗しました。パネルの🔄で反映されます。'
//       : `❌ プレイヤーの追加処理中にエラーが発生しました。時間をおいて再度お試しください。${formatErrorDetail(err)}`;
//     await interaction.editReply({ content }).catch(() => { /* 応答ずみ等は無視 */ });
//   }
// }
