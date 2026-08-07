import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  AutocompleteInteraction,
  VoiceChannel,
} from 'discord.js';
import { checkPermission, PermissionLevel } from '../utils/permissions';
import { truncate } from '../utils/text';
import {
  COUNT_OPTIONS,
  AUDIENCE_OPTIONS,
  RANK_OPTIONS,
  CUSTOM_GAME_VALUE,
  REGULAR_THRESHOLD,
  countLabel,
  audienceLabel,
  rankLabel,
  getCategoryId,
  setCategoryId,
  getGames,
  addGame,
  removeGame,
  getVisitCount,
  registerTempChannel,
  scheduleEmptyGuard,
} from '../services/VoiceRecruitService';

// ── customId 定義 ─────────────────────────────────────────────────────────
const PANEL_BUTTON = 'vc:open';
const SELECT_GAME = 'vc:sel:game';
const SELECT_COUNT = 'vc:sel:count';
const SELECT_AUDIENCE = 'vc:sel:audience';
const SELECT_RANK = 'vc:sel:rank';
const CREATE_BUTTON = 'vc:create';
const CANCEL_BUTTON = 'vc:cancel';
const GAME_MODAL = 'vc:gamemodal';

// 対象者による色分け
const AUDIENCE_COLOR: Record<string, number> = {
  all: 0x5865f2,
  regular: 0xf1c40f,
  newcomer: 0x2ecc71,
};

// ── ウィザードのセッション（ユーザー単位・メモリ保持） ───────────────────────
interface WizardSession {
  game?: string;
  count?: string;
  audience: string; // default 'all'
  rank: string; // default 'none'
  touchedAt: number; // 最終操作時刻（TTL掃除用）
}
const sessions = new Map<string, WizardSession>();
const sessionKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

// 放置されたウィザードでメモリが増え続けないよう、一定時間で破棄する
const SESSION_TTL_MS = 30 * 60 * 1000;

function pruneSessions(): void {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - s.touchedAt > SESSION_TTL_MS) sessions.delete(k);
  }
}

/** セッションを保存（最終操作時刻を更新しつつ、古いものを掃除）。 */
function saveSession(key: string, session: WizardSession): void {
  session.touchedAt = Date.now();
  sessions.set(key, session);
  pruneSessions();
}

/** 既存セッションを取得、無ければ初期セッションを作る。 */
function getOrInitSession(key: string): WizardSession {
  return sessions.get(key) ?? { audience: 'all', rank: 'none', touchedAt: Date.now() };
}

// ── コマンド定義 ──────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('vc')
  .setDescription('[VC募集] 簡易ボイスチャット募集')
  .addSubcommand((s) =>
    s
      .setName('panel')
      .setDescription('このチャンネルに募集パネル（VCを立てるボタン）を設置します'),
  )
  .addSubcommand((s) =>
    s
      .setName('set-category')
      .setDescription('募集VCを作成するカテゴリを設定します')
      .addChannelOption((o) =>
        o
          .setName('category')
          .setDescription('VCを作成するカテゴリ')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('add-game')
      .setDescription('募集フォームのゲーム候補を追加します')
      .addStringOption((o) =>
        o.setName('name').setDescription('追加するゲーム名').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('remove-game')
      .setDescription('募集フォームのゲーム候補を削除します')
      .addStringOption((o) =>
        o
          .setName('name')
          .setDescription('削除するゲーム名')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('settings').setDescription('現在のVC募集設定を表示します'),
  );

// ── パネル/ウィザードの組み立て ────────────────────────────────────────────
function buildPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎙️ VC募集')
    .setDescription(
      '下のボタンを押して、募集内容（ゲーム・人数・対象者・ランク）を選ぶだけ！\n' +
        '専用のボイスチャットが自動で作成されます。\n' +
        '**参加者が全員退出すると、そのVCは自動的に消えます。**',
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PANEL_BUTTON)
      .setLabel('VCを立てる')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

function buildWizard(session: WizardSession, games: string[]) {
  // ゲーム: 最大25件制限のため候補を24件までに絞り、末尾に「その他」を足す
  const gameOptions = games.slice(0, 24).map((g) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncate(g, 100))
      .setValue(truncate(g, 100))
      .setDefault(session.game === g),
  );
  gameOptions.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('その他（手動入力）…')
      .setDescription('一覧に無いゲームを入力します')
      .setValue(CUSTOM_GAME_VALUE)
      .setEmoji('✏️'),
  );

  const gameSelect = new StringSelectMenuBuilder()
    .setCustomId(SELECT_GAME)
    .setPlaceholder('① 募集するゲームを選択')
    .addOptions(gameOptions);

  const countSelect = new StringSelectMenuBuilder()
    .setCustomId(SELECT_COUNT)
    .setPlaceholder('② 参加人数を選択')
    .addOptions(
      COUNT_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDefault(session.count === o.value),
      ),
    );

  const audienceSelect = new StringSelectMenuBuilder()
    .setCustomId(SELECT_AUDIENCE)
    .setPlaceholder('③ 対象者を選択')
    .addOptions(
      AUDIENCE_OPTIONS.map((o) => {
        const opt = new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDefault(session.audience === o.value);
        if (o.description) opt.setDescription(o.description);
        return opt;
      }),
    );

  const rankSelect = new StringSelectMenuBuilder()
    .setCustomId(SELECT_RANK)
    .setPlaceholder('④ 対象ランクを選択')
    .addOptions(
      RANK_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDefault(session.rank === o.value),
      ),
    );

  const ready = Boolean(session.game && session.count);
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CREATE_BUTTON)
      .setLabel('VCを作成')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready),
    new ButtonBuilder()
      .setCustomId(CANCEL_BUTTON)
      .setLabel('キャンセル')
      .setStyle(ButtonStyle.Secondary),
  );

  const content =
    '**🎙️ VC募集フォーム**\n' +
    `> ゲーム: **${session.game ?? '未選択'}**\n` +
    `> 定員: **${session.count ? countLabel(session.count) : '未選択'}**\n` +
    `> 対象者: **${audienceLabel(session.audience)}**\n` +
    `> 対象ランク: **${rankLabel(session.rank)}**\n` +
    (ready ? '\n準備OK！「VCを作成」を押してください。' : '\n※ ゲームと人数を選ぶと作成できます。');

  return {
    content,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(countSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(audienceSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rankSelect),
      buttonRow,
    ],
  };
}

function getDisplayName(interaction: ButtonInteraction): string {
  // キャッシュ済みギルドなら member は GuildMember に絞り込まれ displayName を持つ
  if (interaction.inCachedGuild()) {
    return interaction.member.displayName;
  }
  return interaction.user.username;
}

// ── スラッシュコマンド ────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ使用できます。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'panel') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    const categoryId = await getCategoryId(guild.id);
    if (!categoryId) {
      await interaction.reply({
        content:
          '⚠️ 先に `/vc set-category` でVCの作成先カテゴリを設定してください。\n（設定後にもう一度パネルを設置できます）',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply(buildPanelMessage());
    return;
  }

  if (sub === 'set-category') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    const category = interaction.options.getChannel('category', true);
    await setCategoryId(guild.id, category.id);
    await interaction.reply({
      content: `✅ 募集VCの作成先カテゴリを **${category.name}** に設定しました。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'add-game') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    const name = interaction.options.getString('name', true).trim();
    const added = await addGame(guild.id, name);
    await interaction.reply({
      content: added
        ? `✅ ゲーム候補に **${name}** を追加しました。`
        : `ℹ️ **${name}** は既に候補にあるか、無効な名前です。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'remove-game') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    const name = interaction.options.getString('name', true);
    const removed = await removeGame(guild.id, name);
    await interaction.reply({
      content: removed
        ? `✅ ゲーム候補から **${name}** を削除しました。`
        : `ℹ️ **${name}** は候補にありません。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'settings') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    const categoryId = await getCategoryId(guild.id);
    const games = await getGames(guild.id);
    let content = '⚙️ **VC募集設定**\n\n';
    content += `📁 作成先カテゴリ: ${categoryId ? `<#${categoryId}>` : '未設定（`/vc set-category`）'}\n`;
    content += `🎮 ゲーム候補 (${games.length}): ${games.map((g) => `\`${g}\``).join(' ') || 'なし'}\n`;
    content += `\nℹ️ 対象者「イツメン」はVC参加${REGULAR_THRESHOLD}回以上を目安に表示するラベルです（入室制限はしません）。`;
    await interaction.reply({ content: truncate(content, 1990), flags: MessageFlags.Ephemeral });
    return;
  }
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'name' || !interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const games = await getGames(interaction.guildId);
  const query = focused.value.toLowerCase();
  const filtered = games.filter((g) => g.toLowerCase().includes(query)).slice(0, 25);
  await interaction.respond(filtered.map((g) => ({ name: g, value: g })));
}

// ── ボタン ────────────────────────────────────────────────────────────────
export async function handleButtonInteract(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const key = sessionKey(interaction.guildId, interaction.user.id);

  if (interaction.customId === PANEL_BUTTON) {
    const session: WizardSession = { audience: 'all', rank: 'none', touchedAt: Date.now() };
    saveSession(key, session);
    const games = await getGames(interaction.guildId);
    const wizard = buildWizard(session, games);
    await interaction.reply({
      content: wizard.content,
      components: wizard.components,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === CANCEL_BUTTON) {
    sessions.delete(key);
    await interaction.update({ content: '❌ 募集をキャンセルしました。', components: [] });
    return;
  }

  if (interaction.customId === CREATE_BUTTON) {
    await createRecruitVC(interaction, key);
    return;
  }
}

// ── セレクトメニュー ──────────────────────────────────────────────────────
export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const key = sessionKey(interaction.guildId, interaction.user.id);
  const session = getOrInitSession(key);
  const value = interaction.values[0];

  switch (interaction.customId) {
    case SELECT_GAME:
      if (value === CUSTOM_GAME_VALUE) {
        // モーダルを表示（このセレクトインタラクションはモーダル表示で消費される）
        saveSession(key, session);
        const modal = new ModalBuilder().setCustomId(GAME_MODAL).setTitle('ゲーム名を入力');
        const input = new TextInputBuilder()
          .setCustomId('name')
          .setLabel('ゲーム名')
          .setPlaceholder('例: ぷよぷよ / Apex / …')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await interaction.showModal(modal);
        return;
      }
      session.game = value;
      break;
    case SELECT_COUNT:
      session.count = value;
      break;
    case SELECT_AUDIENCE:
      session.audience = value;
      break;
    case SELECT_RANK:
      session.rank = value;
      break;
    default:
      return;
  }

  saveSession(key, session);
  const games = await getGames(interaction.guildId);
  const wizard = buildWizard(session, games);
  await interaction.update({ content: wizard.content, components: wizard.components });
}

// ── モーダル（ゲーム手動入力） ──────────────────────────────────────────────
export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== GAME_MODAL || !interaction.guildId) return;
  const name = interaction.fields.getTextInputValue('name').trim();
  const key = sessionKey(interaction.guildId, interaction.user.id);
  const session = getOrInitSession(key);

  if (name) {
    // 次回以降のドロップダウンに追加保存
    await addGame(interaction.guildId, name);
    session.game = name;
  }
  saveSession(key, session);

  const games = await getGames(interaction.guildId);
  const wizard = buildWizard(session, games);

  // セレクトメニュー由来のモーダルなので元のメッセージを更新できる
  if (interaction.isFromMessage()) {
    await interaction.update({ content: wizard.content, components: wizard.components });
  } else {
    await interaction.reply({
      content: `✅ ゲーム **${name}** を選択しました。募集パネルからもう一度操作してください。`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ── VC作成本体 ────────────────────────────────────────────────────────────
async function createRecruitVC(interaction: ButtonInteraction, key: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  // チャンネル作成・告知送信で3秒を超える可能性があるため先に応答を保留
  await interaction.deferUpdate();

  const session = sessions.get(key);
  if (!session?.game || !session.count) {
    await interaction.editReply({
      content: '❌ セッションが切れました。お手数ですが募集パネルからやり直してください。',
      components: [],
    });
    return;
  }

  const categoryId = await getCategoryId(guild.id);
  if (!categoryId) {
    await interaction.editReply({
      content: '❌ 管理者がVCの作成先カテゴリを設定していません。（`/vc set-category`）',
      components: [],
    });
    return;
  }
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.editReply({
      content: '❌ 設定された作成先カテゴリが見つかりません。管理者に連絡してください。',
      components: [],
    });
    return;
  }

  const userLimit = parseInt(session.count, 10) || 0; // 0 = 無制限
  const ownerName = getDisplayName(interaction);
  const channelName = truncate(`🎙️｜${session.game}｜${ownerName}`, 95);

  let channel: VoiceChannel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      userLimit,
      reason: `簡易VC募集: ${interaction.user.tag} が作成`,
    });
  } catch (e) {
    console.error('[vc] channel create error:', e);
    await interaction.editReply({
      content:
        '❌ VCの作成に失敗しました。BotにVCの管理（チャンネルの管理）権限があるか確認してください。',
      components: [],
    });
    return;
  }

  sessions.delete(key);

  // 募集主のVC参加回数（ラベル用）
  const visitCount = await getVisitCount(guild.id, interaction.user.id).catch(() => 0);

  // 募集告知メッセージ
  const embed = new EmbedBuilder()
    .setColor(AUDIENCE_COLOR[session.audience] ?? 0x5865f2)
    .setTitle(`🎙️ VC募集: ${session.game}`)
    .setDescription(
      `<@${interaction.user.id}> がVCを立てました！\n➡️ <#${channel.id}> に参加しよう！`,
    )
    .addFields(
      { name: '定員', value: countLabel(session.count), inline: true },
      { name: '対象者', value: audienceLabel(session.audience), inline: true },
      { name: '対象ランク', value: rankLabel(session.rank), inline: true },
    )
    .setFooter({ text: `募集主のVC参加: ${visitCount}回` })
    .setTimestamp(new Date());

  const jumpUrl = `https://discord.com/channels/${guild.id}/${channel.id}`;
  const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('VCへ移動').setEmoji('🔊').setStyle(ButtonStyle.Link).setURL(jumpUrl),
  );

  let announceChannelId: string | null = null;
  let announceMessageId: string | null = null;
  try {
    if (interaction.channel && interaction.channel.isTextBased() && 'send' in interaction.channel) {
      const msg = await interaction.channel.send({
        embeds: [embed],
        components: [linkRow],
        allowedMentions: { parse: [] },
      });
      announceChannelId = interaction.channel.id;
      announceMessageId = msg.id;
    }
  } catch (e) {
    console.error('[vc] announcement send error:', e);
  }

  await registerTempChannel({
    channelId: channel.id,
    guildId: guild.id,
    creatorId: interaction.user.id,
    announceChannelId,
    announceMessageId,
  });

  // 誰も入らなかった場合の保険（3分後に空なら削除）
  scheduleEmptyGuard(channel);

  await interaction.editReply({
    content:
      `✅ VCを作成しました！ → <#${channel.id}>\n` +
      'VCに参加してください（**参加者が全員退出すると自動的に削除**されます）。',
    components: [],
  });
}
