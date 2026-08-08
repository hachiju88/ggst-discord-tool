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
  PermissionFlagsBits,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  AutocompleteInteraction,
  VoiceChannel,
  CategoryChannel,
  GuildBasedChannel,
  BaseMessageOptions,
} from 'discord.js';
import { checkPermission, PermissionLevel } from '../utils/permissions';
import { truncate } from '../utils/text';
import {
  COUNT_OPTIONS,
  AUDIENCE_OPTIONS,
  RANK_OPTIONS,
  PURPOSE_OPTIONS,
  ROOM_OPTIONS,
  CUSTOM_GAME_VALUE,
  CUSTOM_PURPOSE_VALUE,
  CUSTOM_ROOM_VALUE,
  countLabel,
  audienceLabel,
  rankLabel,
  purposeLabel,
  roomLabel,
  getCategoryId,
  setCategoryId,
  getNotifyChannelId,
  setNotifyChannelId,
  getGames,
  addGame,
  removeGame,
  registerTempChannel,
  scheduleEmptyGuard,
  countTempChannelsByGuild,
} from '../services/VoiceRecruitService';

// ── setup で作成するチャンネル構成 ─────────────────────────────────────────
const CATEGORY_NAME = '===== 簡単募集（ベータ版） =====';
const PANEL_CHANNEL_NAME = '簡単募集';
// 用語変更（簡易→簡単）前に作成されたパネルチャンネルの旧名。
// setup 再実行時に重複作成しないよう、旧名も検出して新名へリネームする。
const LEGACY_PANEL_CHANNEL_NAMES = ['簡易募集'];
const NOTIFY_CHANNEL_NAME = '募集通知';

// 募集通知でメンションするロール名（このロールに👍リアクションを促す）
const MENTION_ROLE_NAME = 'メンバー';

// ── customId 定義 ─────────────────────────────────────────────────────────
const PANEL_BUTTON = 'vc:open';
const SELECT_GAME = 'vc:sel:game';
const SELECT_PURPOSE = 'vc:sel:purpose';
const SELECT_COUNT = 'vc:sel:count';
const SELECT_AUDIENCE = 'vc:sel:audience';
const SELECT_RANK = 'vc:sel:rank';
const SELECT_ROOM = 'vc:sel:room';
const CREATE_BUTTON = 'vc:create';
const CANCEL_BUTTON = 'vc:cancel';
const COMMENT_BUTTON = 'vc:comment';
const NEXT_BUTTON = 'vc:next';
const PREV_BUTTON = 'vc:prev';
const GAME_MODAL = 'vc:gamemodal';
const PURPOSE_MODAL = 'vc:purposemodal';
const ROOM_MODAL = 'vc:roommodal';
const COMMENT_MODAL = 'vc:commentmodal';

// 対象者による色分け
const AUDIENCE_COLOR: Record<string, number> = {
  all: 0x5865f2,
  regular: 0xf1c40f,
  newcomer: 0x2ecc71,
};

// ── ウィザードのセッション（ユーザー単位・メモリ保持） ───────────────────────
interface WizardSession {
  game?: string; // default 'GGST'
  purpose?: string; // 募集目的（任意）
  count?: string; // default '0'（制限なし）
  audience: string; // default 'all'
  rank: string; // default 'none'
  room?: string; // 部屋番号（任意）
  comment?: string; // ひとこと（任意）
  page: 1 | 2; // ウィザードの表示ページ（1ページに収まらないため2分割）
  touchedAt: number; // 最終操作時刻（TTL掃除用）
}
const sessions = new Map<string, WizardSession>();
const sessionKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

/** フォームの初期セッション（ゲーム:GGST / 参加人数:制限なし を初期値に）。 */
function newSession(): WizardSession {
  return {
    game: 'GGST',
    count: '0',
    audience: 'all',
    rank: 'none',
    page: 1,
    touchedAt: Date.now(),
  };
}

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
  return sessions.get(key) ?? newSession();
}

// ── コマンド定義 ──────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('vc')
  .setDescription('[VC募集] 簡単ボイスチャット募集')
  .addSubcommand((s) =>
    s
      .setName('setup')
      .setDescription('募集用のカテゴリ・チャンネル一式を自動作成して初期設定します'),
  )
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
      .setName('set-notify')
      .setDescription('作成された募集を投稿する「募集通知」チャンネルを設定します')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('募集通知チャンネル')
          .addChannelTypes(ChannelType.GuildText)
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
    .setTitle('🎙️ 簡単VC募集')
    .setDescription(
      '下のボタンを押して、募集内容（ゲーム・目的・人数・対象者・ランク・部屋番号・ひとこと）を選ぶだけ！\n' +
        '専用のボイスチャットが自動で作成され、募集が「募集通知」チャンネルに投稿されます。\n' +
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

/** 固定候補のセレクトを組み立てる（末尾に「その他（手動入力）」を付与）。 */
function buildOptionSelect(
  customId: string,
  placeholder: string,
  options: { value: string; label: string; description?: string }[],
  selected: string | undefined,
  customValue: string,
): StringSelectMenuBuilder {
  const menuOptions = options.map((o) => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(o.label)
      .setValue(o.value)
      .setDefault(selected === o.value);
    if (o.description) opt.setDescription(o.description);
    return opt;
  });
  menuOptions.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('その他（手動入力）…')
      .setDescription('一覧に無い内容を入力します')
      .setValue(customValue)
      .setEmoji('✏️'),
  );
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(menuOptions);
}

// Discord のメッセージは最大5アクション行のため、6個のセレクトを1画面に置けない。
// そこでウィザードを2ページに分割する:
//   ページ1: ゲーム / 募集目的 / 参加人数 / 対象者
//   ページ2: 対象ランク / 部屋番号
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

  const purposeSelect = buildOptionSelect(
    SELECT_PURPOSE,
    '② 募集目的を選択',
    PURPOSE_OPTIONS,
    session.purpose,
    CUSTOM_PURPOSE_VALUE,
  );

  const countSelect = new StringSelectMenuBuilder()
    .setCustomId(SELECT_COUNT)
    .setPlaceholder('③ 参加人数を選択')
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
    .setPlaceholder('④ 対象者を選択')
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
    .setPlaceholder('⑤ 対象ランクを選択')
    .addOptions(
      RANK_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDefault(session.rank === o.value),
      ),
    );

  const roomSelect = buildOptionSelect(
    SELECT_ROOM,
    '⑥ 部屋番号を選択',
    ROOM_OPTIONS,
    session.room,
    CUSTOM_ROOM_VALUE,
  );

  const ready = Boolean(session.game && session.count);

  // 現在の選択内容の要約（両ページ共通で全項目を表示）
  const content =
    '**🎙️ VC募集フォーム**' +
    `（${session.page}/2 ページ）\n` +
    `> 🎮 ゲーム: **${session.game ?? '未選択'}**\n` +
    `> 🎯 目的: **${session.purpose ? purposeLabel(session.purpose) : '（未選択）'}**\n` +
    `> 👥 定員: **${session.count ? countLabel(session.count) : '未選択'}**\n` +
    `> 🙌 対象者: **${audienceLabel(session.audience)}**\n` +
    `> 🏆 対象ランク: **${rankLabel(session.rank)}**\n` +
    `> 🔑 部屋番号: **${session.room ? roomLabel(session.room) : '（未設定）'}**\n` +
    `> 💬 ひとこと: **${session.comment ? truncate(session.comment, 100) : '（なし）'}**\n` +
    (session.page === 1
      ? '\n① 〜 ④ を選んで「次へ ▶」。'
      : ready
        ? '\n準備OK！「VCを作成」を押してください。'
        : '\n※ ゲームと人数を選ぶと作成できます。');

  if (session.page === 1) {
    const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(NEXT_BUTTON)
        .setLabel('次へ（ランク・部屋番号）')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CANCEL_BUTTON)
        .setLabel('キャンセル')
        .setStyle(ButtonStyle.Secondary),
    );
    return {
      content,
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameSelect),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(purposeSelect),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(countSelect),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(audienceSelect),
        nav,
      ],
    };
  }

  // ページ2
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PREV_BUTTON)
      .setLabel('戻る')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(COMMENT_BUTTON)
      .setLabel(session.comment ? 'ひとこと編集' : 'ひとこと入力')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Secondary),
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
  return {
    content,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rankSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(roomSelect),
      buttonRow,
    ],
  };
}

/** 単一テキスト入力のモーダルを組み立てる（ゲーム/目的/部屋番号の手動入力用）。 */
function buildTextModal(
  customId: string,
  title: string,
  fieldId: string,
  label: string,
  placeholder: string,
  maxLength: number,
): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(fieldId)
    .setLabel(label)
    .setPlaceholder(placeholder)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(maxLength)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
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

  if (sub === 'setup') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await guild.channels.fetch(); // 既存チャンネルをキャッシュに載せる

      // カテゴリ（同名があれば再利用）
      let category = guild.channels.cache.find(
        (c): c is CategoryChannel =>
          c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
      );
      if (!category) {
        category = await guild.channels.create({
          name: CATEGORY_NAME,
          type: ChannelType.GuildCategory,
        });
      }

      // 簡単募集チャンネル（パネル設置先）
      // 新名だけでなく旧名（簡易募集）も検出し、旧名があれば新名へリネームして再利用する。
      // これをしないと用語変更後の setup 再実行で新旧2つのパネルチャンネルが並んでしまう。
      let panelChannel = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.parentId === category!.id &&
          (c.name === PANEL_CHANNEL_NAME || LEGACY_PANEL_CHANNEL_NAMES.includes(c.name)),
      );
      if (panelChannel && panelChannel.name !== PANEL_CHANNEL_NAME) {
        try {
          panelChannel = await panelChannel.setName(PANEL_CHANNEL_NAME);
        } catch (e) {
          console.error('[vc] legacy panel channel rename error:', e);
        }
      }
      if (!panelChannel) {
        panelChannel = await guild.channels.create({
          name: PANEL_CHANNEL_NAME,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: 'ボタンを押すとVC募集フォームが開きます（入力内容はあなたにしか見えません）',
        });
      }

      // 募集通知チャンネル
      let notifyChannel = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.parentId === category!.id &&
          c.name === NOTIFY_CHANNEL_NAME,
      );
      if (!notifyChannel) {
        notifyChannel = await guild.channels.create({
          name: NOTIFY_CHANNEL_NAME,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: '「簡単募集」から作成された募集が投稿されます',
        });
      }

      // 「募集通知」チャンネルは @everyone を読み取り専用にして運用することが多い。
      // その場合でも Bot が募集を投稿できるよう、Bot 自身に投稿権限を明示的に付与する。
      // （これが無いと投稿に失敗し、募集がパネルチャンネルへフォールバック投稿されてしまう）
      const me = guild.members.me;
      if (me && notifyChannel.type === ChannelType.GuildText) {
        try {
          await notifyChannel.permissionOverwrites.edit(me, {
            ViewChannel: true,
            SendMessages: true,
            EmbedLinks: true,
            AddReactions: true,
          });
        } catch (e) {
          console.error('[vc] notify channel overwrite error:', e);
        }
      }

      await setCategoryId(guild.id, category.id);
      await setNotifyChannelId(guild.id, notifyChannel.id);

      // パネルを設置
      if (panelChannel.type === ChannelType.GuildText) {
        await panelChannel.send(buildPanelMessage());
      }

      await interaction.editReply(
        '✅ セットアップ完了！\n' +
          `📁 カテゴリ: **${CATEGORY_NAME}**\n` +
          `🔘 募集パネル: <#${panelChannel.id}>\n` +
          `📣 募集通知: <#${notifyChannel.id}>\n` +
          `🎙️ VCの作成先: 上記カテゴリ\n\n` +
          'あとは <#' + panelChannel.id + '> の「VCを立てる」ボタンから募集できます。',
      );
    } catch (e) {
      console.error('[vc] setup error:', e);
      await interaction.editReply(
        '❌ セットアップに失敗しました。Botに「チャンネルの管理」権限があるか確認してください。',
      );
    }
    return;
  }

  if (sub === 'panel') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    const categoryId = await getCategoryId(guild.id);
    if (!categoryId) {
      await interaction.reply({
        content:
          '⚠️ 先に `/vc setup`（自動作成）または `/vc set-category` でVCの作成先カテゴリを設定してください。',
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

  if (sub === 'set-notify') {
    if (!(await checkPermission(interaction, PermissionLevel.ADMIN))) return;
    const channel = interaction.options.getChannel('channel', true);
    await setNotifyChannelId(guild.id, channel.id);
    await interaction.reply({
      content: `✅ 募集通知チャンネルを <#${channel.id}> に設定しました。`,
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
    // 診断でチャンネル取得（ネットワーク）を行うため、3秒制限を避けて先に応答を保留する。
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const categoryId = await getCategoryId(guild.id);
    const notifyId = await getNotifyChannelId(guild.id);
    const games = await getGames(guild.id);

    // 独立したI/Oは並列で取得する。
    const [category, notify, trackedCount] = await Promise.all([
      categoryId ? guild.channels.fetch(categoryId).catch(() => null) : Promise.resolve(null),
      notifyId ? guild.channels.fetch(notifyId).catch(() => null) : Promise.resolve(null),
      countTempChannelsByGuild(guild.id).catch(() => -1),
    ]);

    let content = '⚙️ **VC募集設定**\n\n';
    content += `📁 作成先カテゴリ: ${categoryId ? `<#${categoryId}>` : '未設定（`/vc setup` または `/vc set-category`）'}\n`;
    content += `📣 募集通知チャンネル: ${notifyId ? `<#${notifyId}>` : '未設定（`/vc set-notify`）'}\n`;
    content += `🎮 ゲーム候補 (${games.length}): ${games.map((g) => `\`${g}\``).join(' ') || 'なし'}\n`;

    // ── 自動削除の状態診断（サーバーログを見られなくても切り分けできるように） ──
    content += '\n🔍 **自動削除の診断**\n';
    // カテゴリ内に現存する募集VC数と、削除対象として追跡中の行数を突き合わせる。
    const liveVcCount = categoryId
      ? guild.channels.cache.filter(
          (c) => c.parentId === categoryId && c.type === ChannelType.GuildVoice,
        ).size
      : 0;
    content += `・追跡中の一時VC(DB): ${trackedCount < 0 ? '取得失敗' : `${trackedCount}件`}`;
    if (categoryId) content += ` / カテゴリ内の現存VC: ${liveVcCount}件`;
    content += '\n';
    if (trackedCount === 0 && liveVcCount > 0) {
      content +=
        '　⚠️ VCは在るのにDBに追跡行がありません。**登録経路の問題**（作成時の登録失敗）が疑われます。\n';
    } else if (trackedCount > 0) {
      content +=
        '　ℹ️ 追跡はできています。空になっても消えない場合は下の権限（チャンネルの管理）を確認してください。\n';
    }

    // Bot権限のチェック
    const me = guild.members.me;
    const mark = (ok: boolean) => (ok ? '✅' : '❌');
    if (me) {
      if (category) {
        const p = me.permissionsIn(category.id);
        content +=
          `・カテゴリ権限: ${mark(p.has(PermissionFlagsBits.ManageChannels))} チャンネルの管理` +
          ` / ${mark(p.has(PermissionFlagsBits.MoveMembers))} メンバーの移動` +
          ` / ${mark(p.has(PermissionFlagsBits.Connect))} 接続\n`;
        if (!p.has(PermissionFlagsBits.ManageChannels)) {
          content +=
            '　→ 「チャンネルの管理」が❌の場合、空VCを削除できません。Botロールまたはカテゴリの権限を確認してください。\n';
        }
      } else if (categoryId) {
        content += '・カテゴリ権限: カテゴリを取得できませんでした（削除された可能性）\n';
      }
      if (notify) {
        const p = me.permissionsIn(notify.id);
        content +=
          `・募集通知権限: ${mark(p.has(PermissionFlagsBits.SendMessages))} 送信` +
          ` / ${mark(p.has(PermissionFlagsBits.EmbedLinks))} 埋め込み` +
          ` / ${mark(p.has(PermissionFlagsBits.AddReactions))} リアクション追加\n`;
      } else if (notifyId) {
        content += '・募集通知権限: チャンネルを取得できませんでした\n';
      }
    }

    content += `\nℹ️ 対象者・対象ランクは募集通知に表示するラベルで、入室そのものは制限しません。`;
    await interaction.editReply({ content: truncate(content, 1990) });
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
    const session = newSession();
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

  if (interaction.customId === NEXT_BUTTON || interaction.customId === PREV_BUTTON) {
    const session = getOrInitSession(key);
    session.page = interaction.customId === NEXT_BUTTON ? 2 : 1;
    saveSession(key, session);
    const games = await getGames(interaction.guildId);
    const wizard = buildWizard(session, games);
    await interaction.update({ content: wizard.content, components: wizard.components });
    return;
  }

  if (interaction.customId === COMMENT_BUTTON) {
    const session = getOrInitSession(key);
    saveSession(key, session);
    const modal = new ModalBuilder().setCustomId(COMMENT_MODAL).setTitle('ひとこと（任意）');
    const input = new TextInputBuilder()
      .setCustomId('comment')
      .setLabel('募集通知に表示するひとこと')
      .setPlaceholder('例: まったり対戦しましょう / 初心者歓迎です')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(100)
      .setRequired(false);
    if (session.comment) input.setValue(session.comment);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
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
    case SELECT_PURPOSE:
      if (value === CUSTOM_PURPOSE_VALUE) {
        saveSession(key, session);
        await interaction.showModal(
          buildTextModal(PURPOSE_MODAL, '募集目的を入力', 'value', '目的', '例: 練習 / エンジョイ / …', 40),
        );
        return;
      }
      session.purpose = value;
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
    case SELECT_ROOM:
      if (value === CUSTOM_ROOM_VALUE) {
        saveSession(key, session);
        await interaction.showModal(
          buildTextModal(ROOM_MODAL, '部屋番号を入力', 'value', '部屋番号', '例: 123456', 20),
        );
        return;
      }
      session.room = value;
      break;
    default:
      return;
  }

  saveSession(key, session);
  const games = await getGames(interaction.guildId);
  const wizard = buildWizard(session, games);
  await interaction.update({ content: wizard.content, components: wizard.components });
}

// ── モーダル（ゲーム手動入力 / ひとこと） ────────────────────────────────────
export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guildId) return;
  const key = sessionKey(interaction.guildId, interaction.user.id);
  const session = getOrInitSession(key);

  if (interaction.customId === GAME_MODAL) {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (name) {
      await addGame(interaction.guildId, name); // 次回以降のドロップダウンに追加保存
      session.game = name;
    }
  } else if (interaction.customId === PURPOSE_MODAL) {
    // 手動入力の目的は候補には追加しない（今回の募集のみに使う）
    const purpose = interaction.fields.getTextInputValue('value').trim();
    session.purpose = purpose || undefined;
  } else if (interaction.customId === ROOM_MODAL) {
    // 手動入力の部屋番号も候補には追加しない
    const room = interaction.fields.getTextInputValue('value').trim();
    session.room = room || undefined;
  } else if (interaction.customId === COMMENT_MODAL) {
    const comment = interaction.fields.getTextInputValue('comment').trim();
    session.comment = comment || undefined;
  } else {
    return;
  }

  saveSession(key, session);
  const games = await getGames(interaction.guildId);
  const wizard = buildWizard(session, games);

  // コンポーネント由来のモーダルなので元のメッセージを更新できる
  if (interaction.isFromMessage()) {
    await interaction.update({ content: wizard.content, components: wizard.components });
  } else {
    await interaction.reply({
      content: '✅ 入力を受け付けました。募集パネルからもう一度操作してください。',
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
      content: '❌ 管理者がVCの作成先カテゴリを設定していません。（`/vc setup`）',
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
  // VC名: 「ゲーム / 目的 / 人数 / 対象者 / 対象ランク」
  // 目的は任意項目のため、未選択なら区切りに含めない。
  const nameParts = [
    session.game,
    session.purpose ? purposeLabel(session.purpose) : null,
    countLabel(session.count),
    audienceLabel(session.audience),
    rankLabel(session.rank),
  ].filter((p): p is string => Boolean(p));
  const channelName = truncate(`🎙️ ${nameParts.join(' / ')}`, 95);

  let channel: VoiceChannel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      userLimit,
      reason: `簡単VC募集: ${interaction.user.tag} が作成`,
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

  // 作成したVCへメンバーを移動するには、Bot自身がそのVCに「接続」できる必要がある。
  // 作成先カテゴリが @everyone の接続を制限していると、新規VCもその制限を継承し、
  // ギルド全体で「メンバーの移動」権限があっても移動に失敗する。これを避けるため、
  // Bot自身に接続・移動を許可する権限上書きを付与しておく（付与できなくても続行）。
  // （ManageChannels は付与しない: VC作成が成功している時点でBotは同権限を持っており、
  //   継承されるため削除も可能。ここに束ねると権限上書き全体が失敗し移動修正まで壊れ得る）
  const me = guild.members.me;
  if (me) {
    try {
      await channel.permissionOverwrites.edit(me, {
        ViewChannel: true,
        Connect: true,
        MoveMembers: true,
      });
    } catch (e) {
      console.error('[vc] bot overwrite error:', e);
    }
  }

  // 部屋番号が指定されていれば、VCの「チャンネルステータス」に「id: 888999」形式で表示する。
  // このバージョンの discord.js には setVoiceStatus が無いため、REST を直接呼ぶ
  // （PUT /channels/{id}/voice-status）。権限不足等で失敗しても続行する。
  if (session.room) {
    try {
      await channel.client.rest.put(`/channels/${channel.id}/voice-status`, {
        body: { status: `id: ${session.room}` },
      });
    } catch (e) {
      console.error('[vc] set voice status error:', e);
    }
  }

  // 募集主が既にどこかのVCに居れば、作成したVCへ移動させる。
  // Discordの仕様上、どのVCにも接続していないユーザーはAPIで移動（引き込み）できない。
  // interaction.member.voice はキャッシュ未反映だと channelId が null になることがあるため、
  // guild.voiceStates.cache からも参照してフォールバックする。
  let moved = false;
  // 移動に失敗した理由。'permission'=権限不足の可能性 / 'left'=移動直前に退出していた。
  let moveFailure: 'permission' | 'left' | null = null;
  const currentVoiceChannelId =
    (interaction.inCachedGuild() ? interaction.member.voice.channelId : null) ??
    guild.voiceStates.cache.get(interaction.user.id)?.channelId ??
    null;
  const wasInVoice = Boolean(currentVoiceChannelId);
  if (currentVoiceChannelId) {
    try {
      const member = interaction.inCachedGuild()
        ? interaction.member
        : await guild.members.fetch(interaction.user.id);
      await member.voice.setChannel(channel);
      moved = true;
    } catch (e) {
      // Move Members / Connect 権限不足などで失敗し得る。握り潰さずログに残す。
      console.error('[vc] move member error:', e);
      // 40032 = 対象ユーザーがVCに接続していない。キャッシュが古く、作成前に退出して
      // いたケース。これは権限の問題ではないので、警告ではなく通常案内にする。
      const code = (e as { code?: number }).code;
      moveFailure = code === 40032 ? 'left' : 'permission';
    }
  }

  // 募集告知メッセージ
  // フィールドは「項目名」の下に「内容」が縦積みで表示され見づらいため、
  // 説明文に「項目名：内容」の横並びで1行ずつ並べる。
  const infoLines = [
    `👤 **作成者：** <@${interaction.user.id}>`,
    `🎮 **ゲーム：** ${session.game}`,
  ];
  if (session.purpose) {
    infoLines.push(`🎯 **目的：** ${purposeLabel(session.purpose)}`);
  }
  infoLines.push(
    `👥 **参加人数：** ${countLabel(session.count)}`,
    `🙌 **対象者：** ${audienceLabel(session.audience)}`,
    `🏆 **対象ランク：** ${rankLabel(session.rank)}`,
  );
  if (session.room) {
    infoLines.push(`🔑 **部屋番号：** ${roomLabel(session.room)}`);
  }
  if (session.comment) {
    infoLines.push(`💬 **ひとこと：** ${truncate(session.comment, 200)}`);
  }
  const embed = new EmbedBuilder()
    .setColor(AUDIENCE_COLOR[session.audience] ?? 0x5865f2)
    .setTitle(`🎙️ ${session.game} 募集`)
    .setDescription(
      `➡️ <#${channel.id}> に参加しよう！\n\n` +
        infoLines.join('\n') +
        '\n\n👍 **参加予定の方はこのメッセージに 👍 を付けてください！**',
    )
    .setTimestamp(new Date());

  const jumpUrl = `https://discord.com/channels/${guild.id}/${channel.id}`;
  const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('VCへ移動').setEmoji('🔊').setStyle(ButtonStyle.Link).setURL(jumpUrl),
  );

  // 「メンバー」ロールが存在すればメンションして参加を呼びかける（👍リアクションを促す）。
  // ロールは RoleManager が常時キャッシュしているため、キャッシュ参照で十分。
  // （募集作成はホットパスなので、ここで全ロールをAPI取得しない。無ければメンションなし）
  const mentionRole = guild.roles.cache.find((r) => r.name === MENTION_ROLE_NAME) ?? null;

  // 募集通知チャンネル（未設定なら実行チャンネルにフォールバック）
  // 投稿後に 👍 リアクションを自動付与する。
  const announce = await postAnnouncement(interaction, guild.id, {
    content: mentionRole ? `<@&${mentionRole.id}>` : undefined,
    embeds: [embed],
    components: [linkRow],
    allowedMentions: mentionRole ? { roles: [mentionRole.id] } : { parse: [] as const },
  });

  await registerTempChannel({
    channelId: channel.id,
    guildId: guild.id,
    creatorId: interaction.user.id,
    announceChannelId: announce?.channelId ?? null,
    announceMessageId: announce?.messageId ?? null,
  });

  // 誰も入らなかった場合の保険（3分後に空なら削除）
  scheduleEmptyGuard(channel);

  // 移動結果を作成者に伝える。
  // Discordの仕様上、Botはどのボイスチャンネルにも接続していないユーザーを
  // VCへ「引き込む」ことができない（既にVCに居るユーザーの移動のみ可能）。
  // そのため未接続の場合は自動移動は不可能で、本人にVCへの参加操作をお願いする。
  let moveLine: string;
  if (moved) {
    moveLine = '➡️ 作成したVCに移動しました。';
  } else if (wasInVoice && moveFailure === 'permission') {
    moveLine =
      '⚠️ 自動移動に失敗しました（Botの「メンバーの移動」権限や接続権限を確認してください）。' +
      '下の「VCへ移動」ボタンから参加できます。';
  } else {
    // 未接続（または移動直前に退出）で自動移動できないケース。
    // ボタンはチャンネルを開くだけなので、開いた先で「参加」を押す必要がある旨を明記する。
    moveLine =
      '🔊 下の「VCへ移動」ボタンでVCを開き、画面の**「ボイスに参加」/「参加」**を押してください。\n' +
      '💡 次回から自動で移動させたい場合は、**先にどこかのVCに入ってから**「VCを作成」を押すと、そのまま新しいVCへ移動します。';
  }

  // 募集通知の投稿結果を作成者に正直に伝える（無言の失敗を防ぐ）。
  let announceLine: string;
  if (!announce) {
    announceLine =
      '\n⚠️ 募集通知の投稿に失敗しました。管理者は `/vc set-notify` で通知チャンネルを設定し、' +
      'Botにそのチャンネルへの「メッセージ送信」権限があるか確認してください。';
  } else if (announce.via === 'fallback-failed') {
    // 通知チャンネルは設定済みだが投稿に失敗 → 権限/チャンネルの確認を促す。
    announceLine =
      `\n⚠️ 募集通知チャンネルへ投稿できなかったため、<#${announce.channelId}> に投稿しました。` +
      '通知チャンネルが削除されていないか、Botにそのチャンネルへの「メッセージ送信」権限があるか確認してください。';
  } else if (announce.via === 'fallback-unset') {
    // 通知チャンネル未設定で実行チャンネルへ投稿した場合の案内。
    announceLine =
      `\n📣 募集を <#${announce.channelId}> に投稿しました。専用の通知先を使うには \`/vc setup\` または \`/vc set-notify\` で設定してください。`;
  } else {
    announceLine = `\n📣 募集を <#${announce.channelId}> に投稿しました。`;
  }

  await interaction.editReply({
    content:
      `✅ VCを作成しました！ → <#${channel.id}>\n` +
      moveLine +
      announceLine +
      '\n（**参加者が全員退出すると自動的に削除**されます）',
    components: [linkRow],
  });
}

/**
 * 募集通知チャンネル（無ければ実行チャンネル）に告知を投稿し、その位置を返す。
 * via は投稿経路を表し、呼び出し側の案内文の出し分けに使う:
 *  - 'notify'          … 設定された通知チャンネルへ投稿できた（正常）
 *  - 'fallback-unset'  … 通知チャンネル未設定のため実行チャンネルへ投稿した
 *  - 'fallback-failed' … 通知チャンネルは設定済みだが投稿に失敗し実行チャンネルへ投稿した
 */
type AnnounceVia = 'notify' | 'fallback-unset' | 'fallback-failed';
async function postAnnouncement(
  interaction: ButtonInteraction,
  guildId: string,
  payload: BaseMessageOptions,
): Promise<{ channelId: string; messageId: string; via: AnnounceVia } | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  // 優先: 設定された募集通知チャンネル
  const notifyId = await getNotifyChannelId(guildId);
  // 通知チャンネルは設定されているのに投稿できなかったか（権限不足/チャンネル削除など）を
  // 区別するためのフラグ。フォールバック時の案内文を正確にするために使う。
  let notifyConfiguredButFailed = false;
  if (notifyId) {
    const ch = await guild.channels.fetch(notifyId).catch(() => null);
    const sendable = getSendable(ch);
    if (sendable) {
      try {
        const msg = await sendable.send(payload);
        await addThumbsUp(msg);
        return { channelId: sendable.id, messageId: msg.id, via: 'notify' };
      } catch (e) {
        console.error('[vc] notify channel send error:', e);
        notifyConfiguredButFailed = true;
      }
    } else {
      // 設定は残っているがチャンネルが取得できない/送信不可（削除・権限など）。
      notifyConfiguredButFailed = true;
    }
  }

  // フォールバック: 実行したチャンネル
  const fallback = getSendable(interaction.channel);
  if (fallback) {
    try {
      const msg = await fallback.send(payload);
      await addThumbsUp(msg);
      return {
        channelId: fallback.id,
        messageId: msg.id,
        via: notifyConfiguredButFailed ? 'fallback-failed' : 'fallback-unset',
      };
    } catch (e) {
      console.error('[vc] fallback announcement send error:', e);
    }
  }
  return null;
}

/** 募集通知メッセージに 👍 リアクションを付与する（失敗しても無視）。 */
async function addThumbsUp(msg: { react?: (emoji: string) => Promise<unknown> }): Promise<void> {
  try {
    await msg.react?.('👍');
  } catch (e) {
    console.error('[vc] add reaction error:', e);
  }
}

/** テキスト送信可能なギルドチャンネルなら返す（そうでなければ null）。 */
interface Sendable {
  id: string;
  send: (payload: BaseMessageOptions) => Promise<{ id: string; react?: (emoji: string) => Promise<unknown> }>;
}
function getSendable(
  channel: GuildBasedChannel | null | undefined | ButtonInteraction['channel'],
): Sendable | null {
  if (channel && channel.type !== ChannelType.DM && 'send' in channel && channel.isTextBased()) {
    return channel as unknown as Sendable;
  }
  return null;
}
