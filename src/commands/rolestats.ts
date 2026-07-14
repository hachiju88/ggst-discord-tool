import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { RoleStatsService, REFRESH_BUTTON_ID } from '../services/RoleStatsService';
import { checkPermission, PermissionLevel } from '../utils/permissions';

// Server Members Intent 未設定時に案内するメッセージ
const INTENT_HINT =
  '❌ メンバー情報の取得に失敗しました。\n' +
  'Discord Developer Portal の Bot 設定で **Server Members Intent** を有効にしてください。';

export const data = new SlashCommandBuilder()
  .setName('rolestats')
  .setDescription('[監視] ロールの所属人数を集計・表示します')
  .addSubcommand((s) =>
    s.setName('show').setDescription('監視パネルを投稿します（以後この位置が自動更新されます）'),
  )
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('監視対象のロールを追加します')
      .addRoleOption((o) =>
        o.setName('role').setDescription('追加するロール').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('監視対象のロールを外します')
      .addRoleOption((o) =>
        o.setName('role').setDescription('外すロール').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('list').setDescription('現在の監視対象ロールを確認します'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ使用できます。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 監視設定は管理者のみ変更・表示できる
  const hasPermission = await checkPermission(interaction, PermissionLevel.ADMIN);
  if (!hasPermission) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const role = interaction.options.getRole('role', true);
    const added = await RoleStatsService.addRole(guild.id, role.id);
    await interaction.reply({
      content: added
        ? `✅ <@&${role.id}> を監視対象に追加しました。`
        : `ℹ️ <@&${role.id}> は既に監視対象です。`,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'remove') {
    const role = interaction.options.getRole('role', true);
    const removed = await RoleStatsService.removeRole(guild.id, role.id);
    await interaction.reply({
      content: removed
        ? `✅ <@&${role.id}> を監視対象から外しました。`
        : `ℹ️ <@&${role.id}> は監視対象ではありません。`,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'list') {
    const ids = await RoleStatsService.getRoleIds(guild.id);
    const content =
      ids.length === 0
        ? 'ℹ️ 監視対象のロールは未設定です。`/rolestats add` で追加してください。'
        : `⚙️ **監視対象ロール (${ids.length}件)**\n` + ids.map((id) => `・<@&${id}>`).join('\n');
    await interaction.reply({
      content,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // subcommand === 'show'
  await interaction.deferReply();

  const ids = await RoleStatsService.getRoleIds(guild.id);
  if (ids.length === 0) {
    await interaction.editReply(
      'ℹ️ 監視対象のロールが未設定です。`/rolestats add role:<ロール>` で追加してから再実行してください。',
    );
    return;
  }

  let payload;
  try {
    payload = await RoleStatsService.buildPanel(guild);
  } catch (error) {
    console.error('[rolestats] buildPanel error:', error);
    await interaction.editReply(INTENT_HINT);
    return;
  }

  const message = await interaction.editReply(payload);
  // このメッセージを以後スケジューラが自動更新する
  await RoleStatsService.setPanel(guild.id, {
    channelId: interaction.channelId,
    messageId: message.id,
  });
}

// 🔄 更新ボタン（誰でも押せる）
export async function handleButtonInteract(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId !== REFRESH_BUTTON_ID) return;
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferUpdate();
  try {
    const payload = await RoleStatsService.buildPanel(guild);
    await interaction.editReply(payload);
  } catch (error) {
    console.error('[rolestats] refresh error:', error);
    await interaction.followUp({ content: INTENT_HINT, flags: MessageFlags.Ephemeral });
  }
}
