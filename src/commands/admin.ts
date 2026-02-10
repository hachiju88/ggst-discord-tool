import { SlashCommandBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { BackupService } from '../services/BackupService';
import { BackupModel } from '../models/Backup';
import { SystemSettingModel } from '../models/SystemSetting';
import { checkPermission, PermissionLevel } from '../utils/permissions';

export const data = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('[GGST] 管理用コマンド')
    .addSubcommand(subcommand =>
        subcommand
            .setName('backup')
            .setDescription('共通データのバックアップを作成します（最新5件まで保持）')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('restore')
            .setDescription('保存されたバックアップからデータを復元します')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('set-role')
            .setDescription('Botの権限ロールを設定します')
            .addStringOption(option =>
                option
                    .setName('type')
                    .setDescription('設定する権限タイプ')
                    .setRequired(true)
                    .addChoices(
                        { name: '管理者 (Admin)', value: 'admin' },
                        { name: '編集者 (Editor)', value: 'editor' }
                    )
            )
            .addRoleOption(option =>
                option
                    .setName('role')
                    .setDescription('割り当てるDiscordロール')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('view-settings')
            .setDescription('現在の権限設定を確認します')
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック (ADMIN)
    const hasPermission = await checkPermission(interaction, PermissionLevel.ADMIN);
    if (!hasPermission) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set-role') {
        const type = interaction.options.getString('type', true);
        const role = interaction.options.getRole('role', true);

        const key = type === 'admin' ? 'admin_role_id' : 'editor_role_id';
        const typeName = type === 'admin' ? '管理者(Admin)' : '編集者(Editor)';

        try {
            await SystemSettingModel.set(key, role.id);
            await interaction.reply({
                content: `✅ **${typeName}** 権限のロールを **${role.name}** に設定しました。`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('[admin] Set role error:', error);
            await interaction.reply({
                content: '❌ 設定の保存中にエラーが発生しました。',
                flags: MessageFlags.Ephemeral
            });
        }

    } else if (subcommand === 'view-settings') {
        try {
            const adminRoleId = await SystemSettingModel.get('admin_role_id');
            const editorRoleId = await SystemSettingModel.get('editor_role_id');

            let content = '⚙️ **現在の権限設定**\n\n';
            content += `👑 **管理者ロール**: ${adminRoleId ? `<@&${adminRoleId}>` : '未設定'}\n`;
            content += `✏️ **編集者ロール**: ${editorRoleId ? `<@&${editorRoleId}>` : '未設定'}\n`;
            content += `\n※ Discord自体の管理者権限を持つユーザーは、常に全てのコマンドを実行できます。`;

            await interaction.reply({
                content,
                allowedMentions: { parse: [] }, // ロールメンション通知を飛ばさない
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('[admin] View settings error:', error);
            await interaction.reply({
                content: '❌ 設定の取得中にエラーが発生しました。',
                flags: MessageFlags.Ephemeral
            });
        }

    } else if (subcommand === 'backup') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // データをエクスポート
            const data = await BackupService.exportData();
            const jsonStr = JSON.stringify(data);
            const createdBy = interaction.user.tag;

            // DBに保存（ローテーション含む）
            await BackupModel.create(jsonStr, createdBy);

            await interaction.editReply({
                content: '✅ データのバックアップを完了しました。（最新5件まで保持されます）'
            });

        } catch (error) {
            console.error('[admin] Backup error:', error);
            await interaction.editReply({
                content: '❌ バックアップの作成中にエラーが発生しました。'
            });
        }

    } else if (subcommand === 'restore') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // バックアップ一覧を取得
            const backups = await BackupModel.getAll();

            if (backups.length === 0) {
                await interaction.editReply('❌ 利用可能なバックアップがありません。');
                return;
            }

            // セレクトメニュー作成
            const selectOptions = backups.map(backup => {
                const date = new Date(backup.created_at).toLocaleString('ja-JP');
                return new StringSelectMenuOptionBuilder()
                    .setLabel(`${date} - ${backup.created_by}`)
                    .setDescription(`ID: ${backup.id}`)
                    .setValue(backup.id.toString());
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('restore_select')
                .setPlaceholder('復元するバックアップを選択してください')
                .addOptions(selectOptions);

            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(selectMenu);

            const response = await interaction.editReply({
                content: '復元するバックアップを選択してください（注意: 現在のデータに上書き・追加されます）:',
                components: [row]
            });

            // 選択待ち
            try {
                const confirmation = await response.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id && i.customId === 'restore_select',
                    time: 60000,
                    componentType: ComponentType.StringSelect
                });

                const backupId = parseInt(confirmation.values[0]);
                const targetBackup = backups.find(b => b.id === backupId);

                if (!targetBackup) {
                    await confirmation.update({ content: '❌ 指定されたバックアップが見つかりません。', components: [] });
                    return;
                }

                // リストア実行
                const data = JSON.parse(targetBackup.data);
                const result = await BackupService.importData(data);

                await confirmation.update({
                    content: `✅ データの復元が完了しました。\n\nバックアップID: ${backupId}\n作成日時: ${new Date(targetBackup.created_at).toLocaleString('ja-JP')}\n\n共通対策: ${result.strategiesCount}件\n技データ: ${result.movesCount}件`,
                    components: []
                });

            } catch (e) {
                await interaction.editReply({ content: '⏳ タイムアウトしました。', components: [] });
            }

        } catch (error) {
            console.error('[admin] Restore error:', error);
            await interaction.editReply({
                content: `❌ データの復元処理中にエラーが発生しました。\n${error}`
            });
        }
    }
}
