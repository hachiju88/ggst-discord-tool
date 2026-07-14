import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { Guild } from 'discord.js';
import { SystemSettingModel } from '../models/SystemSetting';

// 監視対象ロール一覧: rolestats_roles:<guildId> → JSON string[] (role IDs)
const ROLES_PREFIX = 'rolestats_roles:';
// 自動更新パネルの位置: rolestats_panel:<guildId> → JSON { channelId, messageId }
const PANEL_PREFIX = 'rolestats_panel:';

// Embed の説明文は1つあたり最大4096文字。安全側の閾値で分割する。
const MAX_DESC_LEN = 3900;
// 1メッセージあたりの Embed 上限は10個。
const MAX_EMBEDS = 10;

export interface PanelLocation {
  channelId: string;
  messageId: string;
}

export const REFRESH_BUTTON_ID = 'rolestats:refresh';

export class RoleStatsService {
  // ─── 監視対象ロールの設定 ──────────────────────────────────────────────

  static async getRoleIds(guildId: string): Promise<string[]> {
    const raw = await SystemSettingModel.get(ROLES_PREFIX + guildId);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private static async setRoleIds(guildId: string, ids: string[]): Promise<void> {
    // 重複を除去して保存
    await SystemSettingModel.set(ROLES_PREFIX + guildId, JSON.stringify([...new Set(ids)]));
  }

  /** 追加できたら true、既に登録済みなら false */
  static async addRole(guildId: string, roleId: string): Promise<boolean> {
    const ids = await this.getRoleIds(guildId);
    if (ids.includes(roleId)) return false;
    ids.push(roleId);
    await this.setRoleIds(guildId, ids);
    return true;
  }

  /** 削除できたら true、元々未登録なら false */
  static async removeRole(guildId: string, roleId: string): Promise<boolean> {
    const ids = await this.getRoleIds(guildId);
    if (!ids.includes(roleId)) return false;
    await this.setRoleIds(guildId, ids.filter((id) => id !== roleId));
    return true;
  }

  // ─── 自動更新パネルの位置 ──────────────────────────────────────────────

  static async setPanel(guildId: string, location: PanelLocation): Promise<void> {
    await SystemSettingModel.set(PANEL_PREFIX + guildId, JSON.stringify(location));
  }

  static async getPanel(guildId: string): Promise<PanelLocation | null> {
    const raw = await SystemSettingModel.get(PANEL_PREFIX + guildId);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.channelId === 'string' && typeof obj.messageId === 'string') {
        return obj as PanelLocation;
      }
    } catch {
      /* noop */
    }
    return null;
  }

  static async clearPanel(guildId: string): Promise<void> {
    await SystemSettingModel.delete(PANEL_PREFIX + guildId);
  }

  static async getAllPanels(): Promise<{ guildId: string; location: PanelLocation }[]> {
    const rows = await SystemSettingModel.getByPrefix(PANEL_PREFIX);
    const result: { guildId: string; location: PanelLocation }[] = [];
    for (const { key, value } of rows) {
      const guildId = key.slice(PANEL_PREFIX.length);
      try {
        const obj = JSON.parse(value);
        if (obj && typeof obj.channelId === 'string' && typeof obj.messageId === 'string') {
          result.push({ guildId, location: obj as PanelLocation });
        }
      } catch {
        /* 壊れた値はスキップ */
      }
    }
    return result;
  }

  // ─── パネル生成 ────────────────────────────────────────────────────────

  /**
   * 監視対象ロールの所属人数を集計し、Embed パネルを組み立てる。
   *
   * 正確な人数を得るために `guild.members.fetch()` で全メンバーをキャッシュに
   * 載せてから `role.members.size` を数える。これには Discord Developer Portal
   * 側で「Server Members Intent」(特権インテント)を有効化しておく必要がある。
   * 未有効だと fetch が例外を投げるため、呼び出し側で捕捉すること。
   */
  static async buildPanel(guild: Guild): Promise<{
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
  }> {
    const roleIds = await this.getRoleIds(guild.id);

    // 全メンバーをキャッシュに載せる(role.members を正確にするため)
    await guild.members.fetch();

    const entries = roleIds.map((id) => {
      const role = guild.roles.cache.get(id);
      return {
        id,
        exists: !!role,
        position: role?.rawPosition ?? -1,
        count: role ? role.members.size : 0,
      };
    });

    // 存在するロールを先に、Discord のロール順(上位=強い)に合わせて降順表示
    entries.sort((a, b) => {
      if (a.exists !== b.exists) return a.exists ? -1 : 1;
      return b.position - a.position;
    });

    // 重複所属を除いた実メンバー数
    const distinct = new Set<string>();
    for (const id of roleIds) {
      const role = guild.roles.cache.get(id);
      if (role) {
        for (const [memberId] of role.members) distinct.add(memberId);
      }
    }
    const existingCount = entries.filter((e) => e.exists).length;

    const lines = entries.map((e) =>
      e.exists ? `<@&${e.id}> — **${e.count}** 人` : `⚠️ <@&${e.id}> — 削除されたロール`,
    );

    // 4096文字制限に収まるよう説明文を分割
    const chunks: string[] = [];
    let cur = '';
    for (const line of lines) {
      if (cur.length + line.length + 1 > MAX_DESC_LEN) {
        chunks.push(cur);
        cur = '';
      }
      cur += (cur ? '\n' : '') + line;
    }
    if (cur) chunks.push(cur);
    if (chunks.length === 0) {
      chunks.push('（監視対象のロールが設定されていません。`/rolestats add` で追加してください）');
    }

    const truncated = chunks.length > MAX_EMBEDS;
    const embeds = chunks.slice(0, MAX_EMBEDS).map((desc, i) => {
      const eb = new EmbedBuilder().setColor(0x5865f2).setDescription(desc);
      if (i === 0) eb.setTitle('📊 ロール人数モニター');
      return eb;
    });

    const footerParts = [`対象ロール ${existingCount} 件`, `実メンバー数 ${distinct.size} 人`];
    if (truncated) footerParts.push(`※${MAX_EMBEDS}枠を超える分は省略`);
    embeds[embeds.length - 1]
      .setFooter({ text: footerParts.join(' ／ ') })
      .setTimestamp(new Date());

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(REFRESH_BUTTON_ID)
        .setLabel('更新')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    );

    return { embeds, components: [row] };
  }
}
