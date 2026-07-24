import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { Guild, APIEmbedField } from 'discord.js';
import { SystemSettingModel } from '../models/SystemSetting';
import { truncate } from '../utils/text';
import { CHARACTERS } from '../constants/characters';

// 自動セットアップで使う標準グループ名
export const SETUP_GROUP_PLATFORM = 'プラットフォーム';
export const SETUP_GROUP_RANK = 'ランク';
export const SETUP_GROUP_CHARACTER = 'キャラクター';
export const SETUP_GROUP_DEVICE = '入力デバイス';
// 表示・レポート時のグループ順
export const SETUP_GROUP_ORDER = [
  SETUP_GROUP_PLATFORM,
  SETUP_GROUP_RANK,
  SETUP_GROUP_CHARACTER,
  SETUP_GROUP_DEVICE,
];

// プラットフォーム判定キーワード(小文字化して部分一致)
const PLATFORM_KEYWORDS = [
  'ps5', 'ps4', 'ps3', 'playstation', 'プレステ', 'プレイステーション', 'プレステーション',
  'pc', 'steam', 'スチーム', 'スティーム', 'epic',
  'xbox', 'エックスボックス',
  'switch', 'スイッチ',
];

// 入力デバイス判定キーワード
const DEVICE_KEYWORDS = [
  'パッド', 'pad', 'コントローラー', 'controller',
  'レバーレス', 'leverless', 'ヒットボックス', 'hitbox', 'hit box',
  'アケコン', 'アーケードスティック', 'アーケード', 'スティック', 'stick', 'レバー',
  'キーボード', 'keyboard',
];

// ランク判定キーワード
const RANK_KEYWORDS = [
  '闘神', 'グラマス', 'ハイマス',
  'ダイヤ', 'ダイア', 'ダイヤモンド', 'diamond',
  'プラチナ', 'platinum',
  'ゴールド', 'gold',
  'シルバー', 'silver',
  'ブロンズ', 'bronze',
  'アイアン', 'iron',
  'セレスチャル', 'celestial', '天上',
];

// キャラクター名の別名(短縮表記など)。CHARACTERS の先頭セグメントだけでは
// 拾いにくいものを補う。
const CHARACTER_SPECIAL_ALIASES: Record<string, string[]> = {
  'クイーン・ディズィー': ['ディズィー', 'ディジー'],
  'ジャック・オー・ヴァレンタイン': ['ジャックオー'],
  'ベッドマン?': ['ベッドマン'],
  '飛鳥R♯': ['飛鳥'],
  'A.B.A': ['aba', 'a.b.a'],
};

// キャラクターごとの判定別名リストを構築
function buildCharacterAliases(): { full: string; aliases: string[] }[] {
  return CHARACTERS.map((full) => {
    const aliases = new Set<string>();
    const cleaned = full.normalize('NFKC').replace(/[?？]/g, '').trim();
    aliases.add(cleaned.toLowerCase());
    const first = cleaned.split(/[・=＝\s]/)[0];
    if (first) aliases.add(first.toLowerCase());
    for (const extra of CHARACTER_SPECIAL_ALIASES[full] ?? []) {
      aliases.add(extra.toLowerCase());
    }
    // 2文字未満の別名は誤検出しやすいので除外
    return { full, aliases: [...aliases].filter((a) => a.length >= 2) };
  });
}

const CHARACTER_ALIASES = buildCharacterAliases();

/**
 * ロール名から標準グループを推定する。該当なしは null。
 * プラットフォーム→デバイス→キャラクター→ランク の順で判定する
 * (「ゴールドルイス」をランクの「ゴールド」より先にキャラ判定するため)。
 */
export function classifyRoleName(rawName: string): string | null {
  // NFKC 正規化で全角/半角(ＰＣ, 半角カナ ﾊﾟｯﾄﾞ 等)を吸収し、小文字化して比較する
  const name = rawName.normalize('NFKC').trim().toLowerCase();
  if (!name) return null;

  if (PLATFORM_KEYWORDS.some((k) => name.includes(k))) return SETUP_GROUP_PLATFORM;
  if (DEVICE_KEYWORDS.some((k) => name.includes(k))) return SETUP_GROUP_DEVICE;
  if (CHARACTER_ALIASES.some((c) => c.aliases.some((a) => name.includes(a)))) {
    return SETUP_GROUP_CHARACTER;
  }
  if (RANK_KEYWORDS.some((k) => name.includes(k.toLowerCase()))) return SETUP_GROUP_RANK;
  return null;
}

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

  /**
   * サーバーの既存ロール名を自動判別し、標準グループ(プラットフォーム/ランク/
   * キャラクター/入力デバイス)へ一括登録する。既存設定は保持したままマージする
   * (非破壊)。ロール名の読み取りのみで、特権インテントは不要。
   */
  static async autoSetup(guild: Guild): Promise<{
    added: { group: string; roleId: string }[];
    skippedCount: number;
  }> {
    // 全ロールをキャッシュに載せる
    await guild.roles.fetch();

    const groups = await this.getGroups(guild.id);
    const findOrCreate = (name: string): RoleGroup => {
      let g = groups.find((x) => x.name === name);
      if (!g) {
        g = { name, roleIds: [] };
        groups.push(g);
      }
      return g;
    };

    const added: { group: string; roleId: string }[] = [];
    let skippedCount = 0;

    for (const [, role] of guild.roles.cache) {
      if (role.id === guild.id) continue; // @everyone
      if (role.managed) continue; // Bot/連携が管理するロール

      const groupName = classifyRoleName(role.name);
      if (!groupName) {
        skippedCount++;
        continue;
      }

      // 既にどこかのグループにあるならスキップ(移動しない=非破壊)
      const alreadyTracked = groups.some((g) => g.roleIds.includes(role.id));
      if (alreadyTracked) continue;

      findOrCreate(groupName).roleIds.push(role.id);
      added.push({ group: groupName, roleId: role.id });
    }

    if (added.length > 0) await this.setGroups(guild.id, groups);
    return { added, skippedCount };
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

    // 全メンバーをキャッシュに載せる(role.members / pending を正確にするため)
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

    const fields: APIEmbedField[] = [];

    // メンバー/オンボーディング集計(常にパネル先頭へ表示、Bot は除外)
    let memberDone = 0;
    let onboarding = 0;
    for (const [, m] of guild.members.cache) {
      if (m.user.bot) continue;
      if (m.pending) onboarding++;
      else memberDone++;
    }
    fields.push({
      name: `メンバー状況（合計 ${memberDone + onboarding}人）`,
      value: `✅ メンバー — **${memberDone}** 人\n⏳ オンボーディング中 — **${onboarding}** 人`,
    });

    const allDistinct = new Set<string>();
    let existingRoleCount = 0;

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
