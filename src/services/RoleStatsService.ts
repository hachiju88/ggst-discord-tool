import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { Guild, APIEmbedField } from 'discord.js';
import { SystemSettingModel } from '../models/SystemSetting';
import { truncate } from '../utils/text';

// 集計グループ定義: rolestats_groups:<guildId> → JSON RoleGroup[]
const GROUPS_PREFIX = 'rolestats_groups:';
// v1 の旧フラット形式: rolestats_roles:<guildId> → JSON string[] (自動移行してから削除)
const LEGACY_ROLES_PREFIX = 'rolestats_roles:';
// 自動更新パネルの位置: rolestats_panel:<guildId> → JSON { channelId, messageId }
const PANEL_PREFIX = 'rolestats_panel:';

// Embed フィールドの value は最大1024文字。
const MAX_FIELD_LEN = 1024;
// Embed フィールド名は最大256文字。
const MAX_FIELD_NAME_LEN = 256;
// 1 Embed あたりのフィールド上限は25個。
const MAX_FIELDS_PER_EMBED = 25;
// 1 Embed の合計文字数は6000まで。安全側で1メッセージ内の各 Embed をこの範囲に収める。
const MAX_EMBED_CHARS = 5200;
// 1メッセージあたりの Embed 上限は10個。
const MAX_EMBEDS = 10;
// 旧 v1 データを移行する際の受け皿グループ名。
const LEGACY_GROUP_NAME = '未分類';

export interface RoleGroup {
  name: string;
  roleIds: string[];
}

export interface PanelLocation {
  channelId: string;
  messageId: string;
}

export interface AddRoleResult {
  createdGroup: boolean;
  movedFromOtherGroup: boolean;
  alreadyInGroup: boolean;
}

export const REFRESH_BUTTON_ID = 'rolestats:refresh';

export class RoleStatsService {
  // ─── グループ設定 ──────────────────────────────────────────────────────

  /**
   * ギルドの集計グループ一覧を取得する。
   * v1 のフラット形式(rolestats_roles)が残っていれば「未分類」グループへ自動移行する。
   */
  static async getGroups(guildId: string): Promise<RoleGroup[]> {
    const raw = await SystemSettingModel.get(GROUPS_PREFIX + guildId);
    if (raw) {
      return this.parseGroups(raw);
    }

    // グループ未設定の場合のみ、旧フラット形式からの移行を試みる
    const legacy = await SystemSettingModel.get(LEGACY_ROLES_PREFIX + guildId);
    if (legacy) {
      let ids: string[] = [];
      try {
        const arr = JSON.parse(legacy);
        if (Array.isArray(arr)) ids = arr.filter((x): x is string => typeof x === 'string');
      } catch {
        /* 壊れた値は無視 */
      }
      await SystemSettingModel.delete(LEGACY_ROLES_PREFIX + guildId);
      if (ids.length > 0) {
        const groups: RoleGroup[] = [{ name: LEGACY_GROUP_NAME, roleIds: [...new Set(ids)] }];
        await this.setGroups(guildId, groups);
        return groups;
      }
    }
    return [];
  }

  private static parseGroups(raw: string): RoleGroup[] {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((g) => g && typeof g.name === 'string' && Array.isArray(g.roleIds))
        .map((g) => ({
          name: g.name as string,
          roleIds: (g.roleIds as unknown[]).filter((x): x is string => typeof x === 'string'),
        }));
    } catch {
      return [];
    }
  }

  private static async setGroups(guildId: string, groups: RoleGroup[]): Promise<void> {
    // 空グループは保存しない
    const cleaned = groups.filter((g) => g.roleIds.length > 0);
    await SystemSettingModel.set(GROUPS_PREFIX + guildId, JSON.stringify(cleaned));
  }

  static async getGroupNames(guildId: string): Promise<string[]> {
    return (await this.getGroups(guildId)).map((g) => g.name);
  }

  /** グループにロールを追加する（他グループに居れば移動、グループが無ければ作成） */
  static async addRole(guildId: string, groupName: string, roleId: string): Promise<AddRoleResult> {
    const name = groupName.trim();
    const groups = await this.getGroups(guildId);

    const alreadyInGroup = groups.some((g) => g.name === name && g.roleIds.includes(roleId));
    const inOtherGroup = groups.some((g) => g.name !== name && g.roleIds.includes(roleId));

    // いったん全グループから当該ロールを除去してから対象グループへ入れる
    for (const g of groups) {
      g.roleIds = g.roleIds.filter((id) => id !== roleId);
    }

    let target = groups.find((g) => g.name === name);
    let createdGroup = false;
    if (!target) {
      target = { name, roleIds: [] };
      groups.push(target);
      createdGroup = true;
    }
    target.roleIds.push(roleId);

    await this.setGroups(guildId, groups);
    return { createdGroup, movedFromOtherGroup: inOtherGroup, alreadyInGroup };
  }

  /** ロールをすべてのグループから外す。外せたら true */
  static async removeRole(guildId: string, roleId: string): Promise<boolean> {
    const groups = await this.getGroups(guildId);
    let removed = false;
    for (const g of groups) {
      const before = g.roleIds.length;
      g.roleIds = g.roleIds.filter((id) => id !== roleId);
      if (g.roleIds.length < before) removed = true;
    }
    if (removed) await this.setGroups(guildId, groups);
    return removed;
  }

  /** グループごと削除する。削除できたら true */
  static async deleteGroup(guildId: string, groupName: string): Promise<boolean> {
    const name = groupName.trim();
    const groups = await this.getGroups(guildId);
    const next = groups.filter((g) => g.name !== name);
    if (next.length === groups.length) return false;
    await this.setGroups(guildId, next);
    return true;
  }

  // ─── 自動更新パネルの位置 ──────────────────────────────────────────────

  static async setPanel(guildId: string, location: PanelLocation): Promise<void> {
    await SystemSettingModel.set(PANEL_PREFIX + guildId, JSON.stringify(location));
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
   * 集計グループごとにロール所属人数を集計し、Embed パネルを組み立てる。
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
    const groups = await this.getGroups(guild.id);

    // 全メンバーをキャッシュに載せる(role.members を正確にするため)
    await guild.members.fetch();

    const components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(REFRESH_BUTTON_ID)
          .setLabel('更新')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    if (groups.length === 0) {
      const eb = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📊 ロール人数モニター')
        .setDescription(
          '集計グループが未設定です。`/rolestats add group:<グループ名> role:<ロール>` で追加してください。',
        );
      return { embeds: [eb], components };
    }

    const allDistinct = new Set<string>();
    let existingRoleCount = 0;
    const fields: APIEmbedField[] = [];

    for (const group of groups) {
      const entries = group.roleIds.map((id) => {
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

      const groupDistinct = new Set<string>();
      for (const id of group.roleIds) {
        const role = guild.roles.cache.get(id);
        if (role) {
          existingRoleCount++;
          for (const [memberId] of role.members) {
            groupDistinct.add(memberId);
            allDistinct.add(memberId);
          }
        }
      }

      const lines = entries.map((e) =>
        e.exists ? `<@&${e.id}> — **${e.count}** 人` : `⚠️ <@&${e.id}> — 削除されたロール`,
      );
      const chunks = this.chunkLines(lines, MAX_FIELD_LEN);
      if (chunks.length === 0) chunks.push('（ロール未登録）');

      chunks.forEach((value, i) => {
        const name =
          i === 0 ? `${group.name}（実人数 ${groupDistinct.size}人）` : `${group.name}（続き）`;
        fields.push({ name: truncate(name, MAX_FIELD_NAME_LEN), value });
      });
    }

    const embeds = this.packFieldsIntoEmbeds(fields);
    embeds[0].setColor(0x5865f2).setTitle('📊 ロール人数モニター');

    const footer = [
      `グループ ${groups.length} 件`,
      `対象ロール ${existingRoleCount} 件`,
      `実メンバー数 ${allDistinct.size} 人`,
    ];
    if (fields.length > MAX_FIELDS_PER_EMBED * MAX_EMBEDS) footer.push('※一部省略');
    embeds[embeds.length - 1].setFooter({ text: footer.join(' ／ ') }).setTimestamp(new Date());

    return { embeds, components };
  }

  /** 行配列を、1要素あたり maxLen 文字以内の説明文チャンクへ分割する */
  private static chunkLines(lines: string[], maxLen: number): string[] {
    const chunks: string[] = [];
    let cur = '';
    for (const line of lines) {
      // 1行が単独で上限を超える場合は切り詰める
      const safeLine = line.length > maxLen ? truncate(line, maxLen) : line;
      if (cur.length + safeLine.length + 1 > maxLen) {
        if (cur) chunks.push(cur);
        cur = '';
      }
      cur += (cur ? '\n' : '') + safeLine;
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  /** フィールド群を、25個/embed・文字数上限を守って複数 Embed へ詰める */
  private static packFieldsIntoEmbeds(fields: APIEmbedField[]): EmbedBuilder[] {
    const embeds: EmbedBuilder[] = [];
    let current: APIEmbedField[] = [];
    let charCount = 0;

    const flush = () => {
      embeds.push(new EmbedBuilder().setColor(0x5865f2).addFields(current));
      current = [];
      charCount = 0;
    };

    for (const field of fields) {
      if (embeds.length >= MAX_EMBEDS) break; // 上限超過分は破棄
      const size = field.name.length + field.value.length;
      if (
        current.length > 0 &&
        (current.length >= MAX_FIELDS_PER_EMBED || charCount + size > MAX_EMBED_CHARS)
      ) {
        flush();
        if (embeds.length >= MAX_EMBEDS) break;
      }
      current.push(field);
      charCount += size;
    }
    if (current.length > 0 && embeds.length < MAX_EMBEDS) flush();
    if (embeds.length === 0) embeds.push(new EmbedBuilder().setColor(0x5865f2));
    return embeds;
  }
}
