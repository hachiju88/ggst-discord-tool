import { ChatInputCommandInteraction, ButtonInteraction, PermissionsBitField, MessageFlags } from 'discord.js';
import { SystemSettingModel } from '../models/SystemSetting';

export enum PermissionLevel {
    GENERAL = 0,
    EDITOR = 1,
    ADMIN = 2
}

/**
 * 権限レベルをチェックします。
 * 
 * - ADMIN: DB設定された管理者ロール OR Discordの管理者権限
 * - EDITOR: DB設定された編集者ロール OR ADMIN権限
 * - GENERAL: 全員
 * 
 * @param interaction インタラクション
 * @param requiredLevel 必要な権限レベル
 * @returns 権限がある場合は true
 */
export async function checkPermission(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    requiredLevel: PermissionLevel
): Promise<boolean> {
    // GENERALは常に許可
    if (requiredLevel === PermissionLevel.GENERAL) {
        return true;
    }

    const member = interaction.member;

    // メンバー情報が取れない場合は拒否 (DMなど)
    if (!member || typeof member.permissions === 'string') {
        return false;
    }

    // member.roles の型チェック (null/undefined除外)
    if (!member.roles) {
        return false;
    }

    // Discord本来の管理者権限 (ロックアウト防止のため常に最強)
    const isDiscordAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (isDiscordAdmin) {
        return true;
    }

    // 設定されたロールIDを取得
    const adminRoleId = await SystemSettingModel.get('admin_role_id');
    const editorRoleId = await SystemSettingModel.get('editor_role_id');

    // ロールチェック用ヘルパー
    const hasRole = (roleId: string | null): boolean => {
        if (!roleId) return false;
        // member.roles が Manager か Array かで判定が変わる
        if (Array.isArray(member.roles)) {
            return member.roles.includes(roleId);
        } else {
            return member.roles.cache.has(roleId);
        }
    };

    const hasAdminRole = hasRole(adminRoleId);
    const hasEditorRole = hasRole(editorRoleId);

    // ADMINレベルチェック
    if (requiredLevel === PermissionLevel.ADMIN) {
        if (hasAdminRole) return true;

        await interaction.reply({
            content: '🚫 このコマンドを実行する権限がありません。（管理者ロール設定が必要です）',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    // EDITORレベルチェック
    if (requiredLevel === PermissionLevel.EDITOR) {
        if (hasAdminRole || hasEditorRole) return true;

        await interaction.reply({
            content: '🚫 このコマンドを実行する権限がありません。（編集者ロールまたは管理者ロールが必要です）',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    return false;
}
