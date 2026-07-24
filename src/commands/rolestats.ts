import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import { RoleStatsService, REFRESH_BUTTON_ID, SETUP_GROUP_ORDER } from '../services/RoleStatsService';
import { checkPermission, PermissionLevel } from '../utils/permissions';
import { truncate } from '../utils/text';

// Server Members Intent 未設定時に案内するメッセージ
const INTENT_HINT =
  '❌ メンバー情報の取得に失敗しました。\n' +
  'Discord Developer Portal の Bot 設定で **Server Members Intent** を有効にしてください。';

export const data = new SlashCommandBuilder()
  .setName('rolestats')
  .setDescription('[監視] ロールの所属人数をグループ別に集計・表示します')
  .addSubcommand((s) =>
    s.setName('show').setDescription('監視パネルを投稿します（以後この位置が自動更新されます）'),
  )
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('集計グループにロールを追加します（グループが無ければ作成）')
      .addStringOption((o) =>
        o
          .setName('group')
          .setDescription('集計グループ名（例: プラットフォーム / ランク / キャラクター / 入力デバイス）')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('追加するロール').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('ロールを監視対象から外します')
      .addRoleOption((o) =>
        o.setName('role').setDescription('外すロール').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('delete-group')
      .setDescription('集計グループをまるごと削除します')
      .addStringOption((o) =>
        o
          .setName('group')
          .setDescription('削除するグループ名')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('list').setDescription('現在の集計グループと監視ロールを確認します'),
  )
  .addSubcommand((s) =>
    s
      .setName('member-status')
      .setDescription('メンバー/オンボーディング中の人数セクションの表示を切り替えます')
      .addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('表示する(True) / 非表示にする(False)')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('setup')
      .setDescription('既存ロールを名前で自動判別し、標準グループへ一括登録します（非破壊）'),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'group' || !interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const names = await RoleStatsService.getGroupNames(interaction.guildId);
  const query = focused.value.toLowerCase();
  const filtered = names.filter((n) => n.toLowerCase().includes(query)).slice(0, 25);
  await interaction.respond(filtered.map((n) => ({ name: n, value: n })));
}

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
    const group = interaction.options.getString('group', true).trim();
    const role = interaction.options.getRole('role', true);
    if (!group) {
      await interaction.reply({
        content: '❌ グループ名を入力してください。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const result = await RoleStatsService.addRole(guild.id, group, role.id);

    let content: string;
    if (result.alreadyInGroup) {
      content = `ℹ️ <@&${role.id}> は既にグループ **${group}** に登録されています。`;
    } else if (result.movedFromOtherGroup) {
      content = `✅ <@&${role.id}> をグループ **${group}** に移動しました。`;
    } else {
      content = `✅ <@&${role.id}> をグループ **${group}** に追加しました。`;
      if (result.createdGroup) content += `\n🆕 グループ **${group}** を新規作成しました。`;
    }
    await interaction.reply({
      content,
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

  if (subcommand === 'delete-group') {
    const group = interaction.options.getString('group', true).trim();
    const deleted = await RoleStatsService.deleteGroup(guild.id, group);
    await interaction.reply({
      content: deleted
        ? `✅ グループ **${group}** を削除しました。`
        : `ℹ️ グループ **${group}** は存在しません。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'list') {
    const groups = await RoleStatsService.getGroups(guild.id);
    const memberStatus = await RoleStatsService.isMemberStatusEnabled(guild.id);
    let content: string;
    if (groups.length === 0) {
      content =
        'ℹ️ 集計グループは未設定です。`/rolestats add group:<グループ名> role:<ロール>` で追加してください。';
    } else {
      content = `⚙️ **集計グループ (${groups.length}件)**\n`;
      content += groups
        .map((g) => {
          const roles = g.roleIds.map((id) => `<@&${id}>`).join(' ') || '（ロールなし）';
          return `\n**${g.name}** (${g.roleIds.length})\n${roles}`;
        })
        .join('\n');
    }
    content += `\n\n👥 メンバー/オンボーディング集計: ${memberStatus ? '**表示中**' : '非表示'}`;
    await interaction.reply({
      content,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'member-status') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await RoleStatsService.setMemberStatusEnabled(guild.id, enabled);
    await interaction.reply({
      content: enabled
        ? '✅ メンバー/オンボーディングの集計を**表示**します。`/rolestats show` の再実行または🔄で反映されます。'
        : '✅ メンバー/オンボーディングの集計を**非表示**にしました。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === 'setup') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { added, skippedCount } = await RoleStatsService.autoSetup(guild);

    if (added.length === 0) {
      await interaction.editReply(
        'ℹ️ 自動判別できる未登録ロールが見つかりませんでした。\n' +
          `（判別対象外: ${skippedCount}件）ロール名をご確認のうえ \`/rolestats add\` で手動追加してください。`,
      );
      return;
    }

    // グループごとに集約して標準順で表示
    const byGroup = new Map<string, string[]>();
    for (const { group, roleId } of added) {
      const arr = byGroup.get(group) ?? [];
      arr.push(`<@&${roleId}>`);
      byGroup.set(group, arr);
    }
    const orderedNames = [
      ...SETUP_GROUP_ORDER.filter((n) => byGroup.has(n)),
      ...[...byGroup.keys()].filter((n) => !SETUP_GROUP_ORDER.includes(n)),
    ];

    let content = `✅ **${added.length}件** のロールを自動登録しました。\n`;
    for (const name of orderedNames) {
      const mentions = byGroup.get(name) ?? [];
      content += `\n**${name}** (${mentions.length})\n${mentions.join(' ')}`;
    }
    content += `\n\nℹ️ 判別対象外だった **${skippedCount}件** は \`/rolestats add\` で手動追加できます。`;
    content += `\n\`/rolestats show\` でパネルを投稿してください。`;

    // メッセージ長制限(2000)対策で末尾を切り詰める
    await interaction.editReply({
      content: truncate(content, 1990),
      allowedMentions: { parse: [] },
    });
    return;
  }

  // subcommand === 'show'
  await interaction.deferReply();

  const groups = await RoleStatsService.getGroups(guild.id);
  if (groups.length === 0) {
    await interaction.editReply(
      'ℹ️ 集計グループが未設定です。`/rolestats add group:<グループ名> role:<ロール>` で追加してから再実行してください。',
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
