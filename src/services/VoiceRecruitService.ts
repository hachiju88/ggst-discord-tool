import {
  Client,
  Guild,
  VoiceState,
  VoiceChannel,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import type { VoiceBasedChannel } from 'discord.js';
import { getDatabase } from '../database';
import { SystemSettingModel } from '../models/SystemSetting';

/**
 * 簡単VC募集機能のサービス層。
 * - 設定（作成先カテゴリ / 募集通知チャンネル / ゲーム候補）の永続化
 * - 一時VC（参加者が全員退出したら消えるVC）の管理・自動削除
 */

// ── 選択肢の定義 ──────────────────────────────────────────────────────────
export const DEFAULT_GAMES = ['GGST', 'GGST（Switch）', 'スト６', 'シャドバ', 'デュエプレ', 'TRPG', '雀魂'];

// ゲームの「その他（手動入力）」を表すセンチネル値
export const CUSTOM_GAME_VALUE = '__custom__';
// 募集目的・部屋番号の「その他（手動入力）」を表すセンチネル値
export const CUSTOM_PURPOSE_VALUE = '__custom_purpose__';
export const CUSTOM_ROOM_VALUE = '__custom_room__';

export interface Option {
  value: string;
  label: string;
  description?: string;
}

export const COUNT_OPTIONS: Option[] = [
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `${n}人` })),
  { value: '0', label: '制限なし' },
];

// 募集目的（固定候補 + 「その他」は手動入力。候補には追加しない）
export const PURPOSE_OPTIONS: Option[] = [
  { value: 'プレイヤーマッチ', label: 'プレイヤーマッチ' },
  { value: 'ランクマ', label: 'ランクマ' },
  { value: 'コーチング', label: 'コーチング' },
];

// 部屋番号（固定候補 + 「その他」は手動入力。候補には追加しない）
export const ROOM_OPTIONS: Option[] = [
  { value: '888999', label: '888999' },
  { value: '777888', label: '777888' },
  { value: '666777', label: '666777' },
  { value: '555666', label: '555666' },
];

export const AUDIENCE_OPTIONS: Option[] = [
  { value: 'all', label: '制限なし', description: 'どなたでも歓迎' },
  { value: 'newcomer', label: 'サーバー初心者', description: 'サーバーに来て間もない方向け' },
];

export const RANK_OPTIONS: Option[] = [
  { value: 'none', label: '制限なし' },
  { value: 'gold', label: 'ゴールド以下' },
  { value: 'platinum', label: 'プラチナ以下' },
  { value: 'diamond', label: 'ダイヤ以下' },
];

export function countLabel(value: string): string {
  return COUNT_OPTIONS.find((o) => o.value === value)?.label ?? `${value}人`;
}
export function purposeLabel(value: string): string {
  // 固定候補に無ければ手動入力値をそのまま表示
  return PURPOSE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
export function roomLabel(value: string): string {
  return ROOM_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
export function audienceLabel(value: string): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === value)?.label ?? '制限なし';
}
export function rankLabel(value: string): string {
  return RANK_OPTIONS.find((o) => o.value === value)?.label ?? '制限なし';
}

// ── VC開始時間（予約） ──────────────────────────────────────────────────────
// 「今から（即開始）」を表すセンチネル値。これ以外は選択時刻のエポックms文字列。
export const START_NOW_VALUE = 'now';
// 開始時間の刻み（15分）と、ドロップダウンで先読みするスロット数。
// Discordのセレクトは最大25個。先頭の「今から」を除いた24枠＝最大6時間先まで。
const START_STEP_MS = 15 * 60 * 1000;
const START_SLOT_COUNT = 24;
// 表示・スロット境界はJST（UTC+9）基準。9時間は15分の倍数なので、UTCの15分境界と
// JSTの15分境界は一致する（ceil をUTCエポックで取れば正しいJST境界になる）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** エポックms を JST の "HH:MM" にする。翌日分は "翌HH:MM" と表す（nowMs 指定時のみ）。 */
export function formatJstClock(epochMs: number, nowMs?: number): string {
  const d = new Date(epochMs + JST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  let prefix = '';
  if (nowMs != null) {
    const dayOf = (t: number) => Math.floor((t + JST_OFFSET_MS) / DAY_MS);
    const diff = dayOf(epochMs) - dayOf(nowMs);
    if (diff === 1) prefix = '翌';
    else if (diff >= 2) prefix = `${diff}日後 `;
  }
  return `${prefix}${hh}:${mm}`;
}

/** 選択済みの開始時間（session.startAt）を表示用ラベルにする。 */
export function startTimeLabel(startAt: string | undefined, nowMs = Date.now()): string {
  if (!startAt || startAt === START_NOW_VALUE) return '今から（即開始）';
  const ms = Number(startAt);
  if (!Number.isFinite(ms)) return '今から（即開始）';
  return `${formatJstClock(ms, nowMs)}〜`;
}

/**
 * 開始時間ドロップダウンの選択肢を組み立てる（先頭「今から」＋15分刻みで24枠）。
 * スロットは呼び出し時刻（nowMs）を起点に、次の15分境界から並べる（JST表示）。
 */
export function buildStartTimeChoices(
  nowMs = Date.now(),
): { value: string; label: string }[] {
  const first = Math.ceil(nowMs / START_STEP_MS) * START_STEP_MS;
  const choices: { value: string; label: string }[] = [
    { value: START_NOW_VALUE, label: '今から（即開始）' },
  ];
  for (let i = 0; i < START_SLOT_COUNT; i++) {
    const t = first + i * START_STEP_MS;
    choices.push({ value: String(t), label: `${formatJstClock(t, nowMs)}〜` });
  }
  return choices;
}

/**
 * 予約VCの削除保護に使う時刻を、選択値（startAt）から解決する。
 * - 「今から」/未選択/過去/不正値 → null（＝即開始・保護なし＝既存挙動）
 * - 未来の時刻 → そのエポックms（この時刻までは空でも削除しない）
 */
export function resolveProtectUntilMs(
  startAt: string | undefined,
  nowMs = Date.now(),
): number | null {
  if (!startAt || startAt === START_NOW_VALUE) return null;
  const ms = Number(startAt);
  if (!Number.isFinite(ms) || ms <= nowMs) return null;
  return ms;
}

// ── 設定（system_settings に guild 単位で保存） ─────────────────────────────
const CATEGORY_KEY = (guildId: string) => `vc_recruit_category:${guildId}`;
const NOTIFY_KEY = (guildId: string) => `vc_recruit_notify:${guildId}`;
const GAMES_KEY = (guildId: string) => `vc_recruit_games:${guildId}`;

export async function getCategoryId(guildId: string): Promise<string | null> {
  return SystemSettingModel.get(CATEGORY_KEY(guildId));
}

export async function setCategoryId(guildId: string, categoryId: string): Promise<void> {
  await SystemSettingModel.set(CATEGORY_KEY(guildId), categoryId);
}

/** 募集通知（作成された募集を投稿する）チャンネル */
export async function getNotifyChannelId(guildId: string): Promise<string | null> {
  return SystemSettingModel.get(NOTIFY_KEY(guildId));
}

export async function setNotifyChannelId(guildId: string, channelId: string): Promise<void> {
  await SystemSettingModel.set(NOTIFY_KEY(guildId), channelId);
}

/** 保存済みゲーム候補を取得（未設定ならデフォルトを返す） */
export async function getGames(guildId: string): Promise<string[]> {
  const raw = await SystemSettingModel.get(GAMES_KEY(guildId));
  if (!raw) return [...DEFAULT_GAMES];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.every((v) => typeof v === 'string')) {
      return arr as string[];
    }
  } catch {
    // 壊れていたらデフォルトにフォールバック
  }
  return [...DEFAULT_GAMES];
}

/** ゲーム候補を追加（重複・空白は無視）。追加されたら true。 */
export async function addGame(guildId: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const games = await getGames(guildId);
  // 大文字小文字・全角半角までは見ない素朴な重複チェック
  if (games.some((g) => g === trimmed)) return false;
  // Discord のセレクトは最大25件。ウィザードは末尾に「その他」を足すため
  // 候補は24件までに制限し、上限に達していたら古いものを1つ落とす。
  const next = [...games, trimmed];
  while (next.length > 24) next.shift();
  await SystemSettingModel.set(GAMES_KEY(guildId), JSON.stringify(next));
  return true;
}

/** ゲーム候補を削除。削除できたら true。 */
export async function removeGame(guildId: string, name: string): Promise<boolean> {
  const games = await getGames(guildId);
  const next = games.filter((g) => g !== name);
  if (next.length === games.length) return false;
  await SystemSettingModel.set(GAMES_KEY(guildId), JSON.stringify(next));
  return true;
}

// ── 一時VCの管理 ────────────────────────────────────────────────────────
export async function registerTempChannel(params: {
  channelId: string;
  guildId: string;
  creatorId: string;
  announceChannelId?: string | null;
  announceMessageId?: string | null;
  // 予約VCの削除保護時刻（エポックms）。この時刻までは空でも自動削除しない。
  // 「今から」の即開始VCは null（＝保護なし＝従来どおり）。
  protectUntilMs?: number | null;
  // 予約VCで、開始時刻に差し替えるチャンネルステータス。
  //  - "id: 888999" のような文字列 … 開始時刻にこの内容へ差し替える
  //  - ""（空文字）           … 開始時刻にステータスをクリアする
  //  - null                   … 差し替え予定なし（即開始VCや適用済み）
  postStartStatus?: string | null;
}): Promise<void> {
  const db = getDatabase();
  await db.execute({
    sql: `
      INSERT OR REPLACE INTO temp_voice_channels
        (channel_id, guild_id, creator_id, announce_channel_id, announce_message_id, protect_until_ms, post_start_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    args: [
      params.channelId,
      params.guildId,
      params.creatorId,
      params.announceChannelId ?? null,
      params.announceMessageId ?? null,
      params.protectUntilMs ?? null,
      params.postStartStatus ?? null,
    ],
  });
}

interface TempChannelRow {
  channel_id: string;
  guild_id: string;
  creator_id: string;
  announce_channel_id: string | null;
  announce_message_id: string | null;
  created_at: string | null;
  protect_until_ms: number | null;
  post_start_status: string | null;
}

/**
 * temp_voice_channels.created_at（SQLite CURRENT_TIMESTAMP: UTCの
 * 'YYYY-MM-DD HH:MM:SS'）をエポックミリ秒に変換する。
 * パースできない場合は 0（＝十分に古い扱い）を返し、掃除対象から漏れないようにする。
 */
function parseCreatedAtMs(s: string | null): number {
  if (!s) return 0;
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? 0 : t;
}

/** DBの1行を TempChannelRow に整形する（列追加時の変更点を1箇所に集約）。 */
function mapTempChannelRow(r: any): TempChannelRow {
  return {
    channel_id: String(r.channel_id),
    guild_id: String(r.guild_id),
    creator_id: String(r.creator_id),
    announce_channel_id: r.announce_channel_id ? String(r.announce_channel_id) : null,
    announce_message_id: r.announce_message_id ? String(r.announce_message_id) : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
    protect_until_ms: r.protect_until_ms != null ? Number(r.protect_until_ms) : null,
    // 空文字（＝開始時にクリア）と null（＝差し替え予定なし）を区別して保持する。
    post_start_status: r.post_start_status != null ? String(r.post_start_status) : null,
  };
}

/** 予約VCの削除保護が有効か（now が保護時刻より前なら true＝まだ削除しない）。 */
function isProtected(row: TempChannelRow, nowMs = Date.now()): boolean {
  return row.protect_until_ms != null && nowMs < row.protect_until_ms;
}

async function getTempChannel(channelId: string): Promise<TempChannelRow | null> {
  const db = getDatabase();
  const res = await db.execute({
    sql: 'SELECT * FROM temp_voice_channels WHERE channel_id = ?',
    args: [channelId],
  });
  if (res.rows.length === 0) return null;
  return mapTempChannelRow(res.rows[0]);
}

async function deleteTempChannelRow(channelId: string): Promise<void> {
  const db = getDatabase();
  await db.execute({
    sql: 'DELETE FROM temp_voice_channels WHERE channel_id = ?',
    args: [channelId],
  });
}

/** 指定ギルドで追跡中（＝自動削除対象として登録済み）の一時VC数。診断用。 */
export async function countTempChannelsByGuild(guildId: string): Promise<number> {
  const db = getDatabase();
  const res = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM temp_voice_channels WHERE guild_id = ?',
    args: [guildId],
  });
  const row = res.rows[0] as { n?: number | bigint } | undefined;
  return Number(row?.n ?? 0);
}

/** 指定ギルドで追跡中の一時VC行を取得する（診断用）。 */
async function getTempChannelsByGuild(guildId: string): Promise<TempChannelRow[]> {
  const db = getDatabase();
  const res = await db.execute({
    sql: 'SELECT * FROM temp_voice_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return res.rows.map(mapTempChannelRow);
}

/**
 * 追跡中の一時VCをfetchした結果を「存在／本当に無い／一時的失敗」で区別する。
 * guild.channels.fetch は存在しないと 10003 を投げる。10003 と型不一致だけを
 * 「gone（行を消してよい）」とし、それ以外のネットワーク/API失敗は transient として
 * 行を残す（誤って生存チャンネルの追跡を失わないため）。
 */
type FetchTempResult =
  | { kind: 'channel'; channel: VoiceChannel }
  | { kind: 'gone' }
  | { kind: 'transient'; detail: string };

async function fetchTempVoiceChannel(
  guild: Guild,
  channelId: string,
): Promise<FetchTempResult> {
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return { kind: 'gone' };
    return { kind: 'channel', channel: channel as VoiceChannel };
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 10003) return { kind: 'gone' }; // Unknown Channel = 本当に存在しない
    return { kind: 'transient', detail: (e as { message?: string }).message ?? String(e) };
  }
}

/** そのVCに対するBotの実効権限（Missing Access等の原因特定用）。 */
export interface BotChannelPerms {
  view: boolean; // チャンネルを見る（不足すると多くの操作が Missing Access になる）
  manageChannels: boolean; // チャンネルの管理（削除に必要）
  manageRoles: boolean; // 権限の管理（権限上書きの編集に必要）
  connect: boolean;
  moveMembers: boolean;
}

/** 1件の一時VCに対する即時掃除の結果（Discord上で原因を切り分けるための診断）。 */
export interface SweepDiagResult {
  channelId: string;
  name: string | null;
  ageMs: number | null; // 作成からの経過（created_at 不明なら null）
  memberCount: number | null; // Botが認識している在室人数（チャンネル消失なら null）
  outcome: 'deleted' | 'occupied' | 'gone' | 'delete_failed' | 'fetch_failed' | 'protected';
  detail?: string; // delete_failed / fetch_failed の理由など / protected の開始予定時刻
  perms?: BotChannelPerms; // チャンネルが存在する場合のBot実効権限
}

/** そのVCに対するBotの実効権限を取り出す。 */
function getBotChannelPerms(guild: Guild, vc: VoiceChannel): BotChannelPerms | undefined {
  const me = guild.members.me;
  if (!me) return undefined;
  // permissionsFor はメンバーを解決できないと null を返しうる。null で .has を
  // 呼ぶと throw して掃除全体が失敗するため、その場合は undefined を返す。
  const p = vc.permissionsFor(me);
  if (!p) return undefined;
  return {
    view: p.has(PermissionFlagsBits.ViewChannel),
    manageChannels: p.has(PermissionFlagsBits.ManageChannels),
    manageRoles: p.has(PermissionFlagsBits.ManageRoles),
    connect: p.has(PermissionFlagsBits.Connect),
    moveMembers: p.has(PermissionFlagsBits.MoveMembers),
  };
}

/**
 * 指定ギルドの追跡中一時VCを、猶予なし・two-strikeなしで即時に掃除し、
 * 各VCについて「なぜ消えた／消えなかったか」を返す診断用関数。
 * 管理者が Discord 上から手動実行して原因を切り分ける（サーバーログ不要）。
 *
 * ※ 定期掃除と違い two-strike/猶予を挟まず即削除する。管理者が空を確認した上で
 * 　明示的に押す「今すぐ削除」だからこの割り切りにしている。ただし理屈上、
 * 　ゲートウェイ再接続直後にボイス状態キャッシュが未充填だと在室VCが空に見えうる。
 * 　その場合は在室人数を results で提示し（occupied として表示）、実削除は
 * 　members.size===0 の時のみ行うことで、誤削除の窓を最小化している。
 */
export async function sweepGuildNow(guild: Guild): Promise<SweepDiagResult[]> {
  const rows = await getTempChannelsByGuild(guild.id);
  const now = Date.now();
  const results: SweepDiagResult[] = [];
  for (const row of rows) {
    const ageMs = row.created_at ? now - parseCreatedAtMs(row.created_at) : null;
    const fetched = await fetchTempVoiceChannel(guild, row.channel_id);
    if (fetched.kind === 'transient') {
      // 一時的なfetch失敗。行は残して次回に委ねる（生存チャンネルの追跡を失わない）。
      results.push({
        channelId: row.channel_id,
        name: null,
        ageMs,
        memberCount: null,
        outcome: 'fetch_failed',
        detail: fetched.detail,
      });
      continue;
    }
    if (fetched.kind === 'gone') {
      await reactAnnouncementEnded(guild.client, row);
      await deleteTempChannelRow(row.channel_id);
      results.push({ channelId: row.channel_id, name: null, ageMs, memberCount: null, outcome: 'gone' });
      continue;
    }
    const vc = fetched.channel;
    const perms = getBotChannelPerms(guild, vc);
    const memberCount = vc.members.size;
    if (memberCount > 0) {
      results.push({ channelId: vc.id, name: vc.name, ageMs, memberCount, outcome: 'occupied', perms });
      continue;
    }
    // 予約VC: 開始予定時刻まではここでも削除しない（誤削除防止）。
    // 手動掃除でも保護を尊重し、開始予定時刻を detail に添えて理由を提示する。
    if (isProtected(row, now)) {
      results.push({
        channelId: vc.id,
        name: vc.name,
        ageMs,
        memberCount,
        outcome: 'protected',
        detail: `${formatJstClock(row.protect_until_ms as number, now)}開始予定`,
        perms,
      });
      continue;
    }
    try {
      await vc.delete('簡単VC募集: 手動掃除（診断）');
      await reactAnnouncementEnded(guild.client, row);
      await deleteTempChannelRow(vc.id);
      results.push({ channelId: vc.id, name: vc.name, ageMs, memberCount, outcome: 'deleted', perms });
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 10003) {
        await deleteTempChannelRow(vc.id);
        results.push({ channelId: vc.id, name: vc.name, ageMs, memberCount, outcome: 'gone', perms });
      } else {
        results.push({
          channelId: vc.id,
          name: vc.name,
          ageMs,
          memberCount,
          outcome: 'delete_failed',
          detail: (e as { message?: string }).message ?? String(e),
          perms,
        });
      }
    }
  }
  return results;
}

async function getAllTempChannels(): Promise<TempChannelRow[]> {
  const db = getDatabase();
  const res = await db.execute({ sql: 'SELECT * FROM temp_voice_channels' });
  return res.rows.map(mapTempChannelRow);
}

// VCが閉じたことを示すため募集通知メッセージに付けるリアクション。
const ANNOUNCE_ENDED_EMOJI = '🏁';

/**
 * 募集通知メッセージに「終了」を示すリアクションを付ける（VC削除の起点で呼ぶ）。
 * 通知メッセージ自体は残す方針なので、編集ではなくリアクションで終了を示す。
 * 通知情報が無い/取得できない/失敗しても無視する。
 */
async function reactAnnouncementEnded(client: Client, row: TempChannelRow): Promise<void> {
  if (!row.announce_channel_id || !row.announce_message_id) return;
  try {
    const ch = await client.channels.fetch(row.announce_channel_id).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    const msg = await ch.messages.fetch(row.announce_message_id).catch(() => null);
    if (!msg) return;
    await msg.react(ANNOUNCE_ENDED_EMOJI);
  } catch (e) {
    console.error('[VoiceRecruit] mark announcement ended error:', e);
  }
}

/**
 * 一時VCが空になっていれば削除する。削除したら true。
 * 募集通知メッセージは残すが、削除を起点に「終了」を示すリアクションを付ける。
 *
 * knownRow を渡すと管理行の再取得（DB SELECT）を省略する（掃除ループ用）。
 * undefined のときのみ getTempChannel で取得する。
 */
async function deleteIfEmpty(
  channel: VoiceBasedChannel,
  knownRow?: TempChannelRow | null,
): Promise<boolean> {
  const row = knownRow !== undefined ? knownRow : await getTempChannel(channel.id);
  if (!row) return false; // 管理対象外
  if (channel.members.size > 0) return false; // まだ人がいる
  // 予約VC: 開始時刻まで（保護時刻まで）は空でも削除しない。時刻を過ぎたら
  // 以降は通常どおり（この関数を通る全経路＝退室イベント/空ガード/定期掃除）で削除される。
  if (isProtected(row)) return false;

  try {
    await channel.delete('簡単VC募集: 参加者が全員退出したため自動削除');
  } catch (e) {
    // 10003 = Unknown Channel（既に削除済み）。この場合は行だけ掃除して完了扱い。
    const code = (e as { code?: number }).code;
    if (code !== 10003) {
      // 権限不足などで削除に失敗した場合は「行を消さずに」残す。
      // ここで行を消してしまうと、退出イベント・空ガード・起動時sweepの
      // どれも二度と再試行せず、空VCが永久に残ってしまう（自動削除が効かない原因）。
      // 行を残せば次のトリガーで再試行できる。原因追跡のためエラーも握り潰さず記録する。
      console.error(`[VoiceRecruit] channel delete failed (will retry): ${channel.id}`, e);
      return false;
    }
  }
  await reactAnnouncementEnded(channel.client, row);
  await deleteTempChannelRow(channel.id);
  return true;
}

/**
 * voiceStateUpdate から呼ぶ。
 * - 一時VCが空になったら自動削除
 */
export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  // 退出元が一時VCなら空チェック
  if (oldState.channel && oldState.channelId !== newState.channelId) {
    try {
      await deleteIfEmpty(oldState.channel);
    } catch (e) {
      console.error('[VoiceRecruit] deleteIfEmpty error:', e);
    }
  }
}

/** 空ガードの既定猶予（作成 or 開始予定時刻から、誰も来なければ削除するまでの時間）。 */
const EMPTY_GUARD_GRACE_MS = 30 * 60 * 1000;
// setTimeout の遅延は 32bit(約24.8日)を超えると即発火扱いになるため上限を設ける。
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * VC作成直後に呼ぶ。一定時間後にまだ誰も入っていなければ削除する保険。
 * （募集主が結局VCに入らなかったケースの掃除）
 *
 * protectUntilMs（予約VCの開始予定時刻）を渡すと、その時刻＋猶予後に発火するよう
 * 遅延を延ばす。予約VCは開始時刻まで削除保護されるため、作成直後の既定猶予で発火しても
 * deleteIfEmpty 側で弾かれて掃除されない。開始時刻を起点に猶予を与えることで、
 * 「誰も来なかった予約VC」を開始予定を過ぎてから確実に片付ける。
 */
export function scheduleEmptyGuard(
  channel: VoiceChannel,
  opts: { protectUntilMs?: number | null; graceMs?: number } = {},
): void {
  const grace = opts.graceMs ?? EMPTY_GUARD_GRACE_MS;
  const base =
    opts.protectUntilMs && opts.protectUntilMs > Date.now()
      ? opts.protectUntilMs - Date.now() // 開始予定時刻を起点にする
      : 0;
  const delayMs = Math.min(base + grace, MAX_TIMEOUT_MS);
  setTimeout(async () => {
    try {
      const fresh = await channel.guild.channels.fetch(channel.id).catch(() => null);
      if (fresh && fresh.type === ChannelType.GuildVoice) {
        await deleteIfEmpty(fresh as VoiceChannel);
      }
    } catch {
      // 無視
    }
  }, delayMs).unref?.();
}

// ── 予約VC: 開始時刻でのチャンネルステータス差し替え ─────────────────────────
/** DBの post_start_status を消す（開始後ステータス適用済みの印）。 */
async function clearPostStartStatus(channelId: string): Promise<void> {
  const db = getDatabase();
  await db.execute({
    sql: 'UPDATE temp_voice_channels SET post_start_status = NULL WHERE channel_id = ?',
    args: [channelId],
  });
}

/**
 * 予約VCの開始時刻に、チャンネルステータスを開始後の表示へ差し替える。
 * status が空文字ならステータスをクリアする（"20:00開始 / id: 888999" → "id: 888999"、
 * 部屋番号が無ければ完全にクリア）。適用後は post_start_status を消し、
 * 再起動時の再武装での二重適用を防ぐ。失敗してもVC運用には影響しないため握り潰す。
 */
async function finalizeVoiceStatus(channel: VoiceChannel, status: string): Promise<void> {
  try {
    // 空文字は null を送って明示的にクリアする（APIは status を nullable として受ける）。
    await channel.client.rest.put(`/channels/${channel.id}/voice-status`, {
      body: { status: status || null },
    });
  } catch (e) {
    console.error('[VoiceRecruit] finalize voice status error:', e);
  }
  await clearPostStartStatus(channel.id).catch((e) =>
    console.error('[VoiceRecruit] clear post_start_status error:', e),
  );
}

/**
 * 予約VCの開始時刻にチャンネルステータスを差し替えるタイマーを仕込む（作成直後に呼ぶ）。
 * このタイマーは再起動で失われるが、起動時の rearmReservedStatusFinalizers で復旧する。
 */
export function scheduleStatusFinalize(
  channel: VoiceChannel,
  delayMs: number,
  status: string,
): void {
  const delay = Math.min(Math.max(delayMs, 0), MAX_TIMEOUT_MS);
  setTimeout(async () => {
    try {
      const fresh = await channel.guild.channels.fetch(channel.id).catch(() => null);
      if (fresh && fresh.type === ChannelType.GuildVoice) {
        await finalizeVoiceStatus(fresh as VoiceChannel, status);
      } else {
        // チャンネルが既に無ければ差し替え不要。行は掃除側で消えるが念のため印だけ消す。
        await clearPostStartStatus(channel.id).catch(() => {});
      }
    } catch (e) {
      console.error('[VoiceRecruit] scheduleStatusFinalize error:', e);
    }
  }, delay).unref?.();
}

/**
 * 起動時に、開始後ステータス差し替えが未適用の予約VC（post_start_status が残る行）を
 * 再武装する。開始時刻を過ぎていれば即適用、未来ならタイマーを仕込む。
 * 再起動で失われた scheduleStatusFinalize を復旧するための保険。
 */
export async function rearmReservedStatusFinalizers(client: Client): Promise<void> {
  let rows: TempChannelRow[];
  try {
    rows = await getAllTempChannels();
  } catch (e) {
    console.error('[VoiceRecruit] rearm status finalizers load error:', e);
    return;
  }
  const now = Date.now();
  for (const row of rows) {
    if (row.post_start_status == null) continue; // 差し替え予定なし or 適用済み
    try {
      const guild =
        client.guilds.cache.get(row.guild_id) ??
        (await client.guilds.fetch(row.guild_id).catch(() => null));
      if (!guild) continue;
      const fetched = await fetchTempVoiceChannel(guild, row.channel_id);
      if (fetched.kind !== 'channel') continue; // 無い/一時失敗は触らない（掃除に委ねる）
      const delay = (row.protect_until_ms ?? now) - now;
      if (delay <= 0) await finalizeVoiceStatus(fetched.channel, row.post_start_status);
      else scheduleStatusFinalize(fetched.channel, delay, row.post_start_status);
    } catch (e) {
      console.error(`[VoiceRecruit] rearm status finalizer error for ${row.channel_id}:`, e);
    }
  }
}

/**
 * 追跡中の一時VCを一括で掃除する。
 * - チャンネルが既に無い → 行だけ削除
 * - 空（在室0） → チャンネルとともに削除
 *
 * confirmSet を渡すと「2サイクル連続で空だった時だけ削除」する（two-strike）。
 * ゲートウェイ再接続直後などボイス状態キャッシュが未充填の瞬間は在室VCでも
 * members.size が 0 に見えることがあり、定期掃除がその瞬間に当たると在室VCを
 * 誤削除しうる。1回空を観測したら候補に入れるだけにし、次サイクルでも空なら削除
 * することで、一時的な空読みでの誤削除を防ぐ。
 *
 * ※ 本来 voiceStateUpdate（退出時）で消えるので、通常フロー（移動 or 入室→退出）は
 * 　即座に削除される。この掃除が拾うのは「一度も誰も入らなかったVC」＝退出イベントが
 * 　発生しないケースの保険。two-strike があるため作成直後の猶予は設けていない
 * 　（誰も入らないまま2サイクル継続した時だけ消える）。
 */
export async function sweepTempChannels(
  client: Client,
  confirmSet?: Set<string>,
): Promise<void> {
  let rows: TempChannelRow[];
  try {
    rows = await getAllTempChannels();
  } catch (e) {
    console.error('[VoiceRecruit] sweepTempChannels load error:', e);
    return;
  }

  // 同一ギルドに複数の一時VCがあっても guild fetch を1回で済ませるためにまとめる。
  const rowsByGuild = new Map<string, TempChannelRow[]>();
  for (const row of rows) {
    const list = rowsByGuild.get(row.guild_id);
    if (list) list.push(row);
    else rowsByGuild.set(row.guild_id, [row]);
  }

  for (const [guildId, guildRows] of rowsByGuild) {
    const guild =
      client.guilds.cache.get(guildId) ??
      (await client.guilds.fetch(guildId).catch(() => null));
    // ギルドを取得できない＝Botが抜けた等の可能性。ただし一時的なfetch失敗も
    // ありうるので、ここで行を消さずにこのサイクルは丸ごとスキップする
    // （生存中のギルドの追跡を一括で失わないため）。
    if (!guild) continue;
    for (const row of guildRows) {
      try {
        const fetched = await fetchTempVoiceChannel(guild, row.channel_id);
        if (fetched.kind === 'transient') {
          // 一時的なfetch失敗。行は残し、候補集合も触らず次サイクルに委ねる。
          continue;
        }
        if (fetched.kind === 'gone') {
          // 外部削除（管理者が手動削除・Bot停止中に削除など）でも終了を示す。
          await reactAnnouncementEnded(client, row);
          await deleteTempChannelRow(row.channel_id);
          confirmSet?.delete(row.channel_id);
          continue;
        }
        const vc = fetched.channel;
        // 在室中はスキップ（候補からも外す）。
        // ここでの在室判定は two-strike 集合の管理用。実削除の可否は
        // deleteIfEmpty 内の members.size チェックが最終的な拠り所（退出イベントや
        // 空ガード経由の呼び出しではそちらだけが働く）ので、両者は役割が異なる。
        if (vc.members.size > 0) {
          confirmSet?.delete(row.channel_id);
          continue;
        }
        // 予約VC: 開始予定時刻まではスキップ（削除候補にも入れない）。
        if (isProtected(row)) {
          confirmSet?.delete(row.channel_id);
          continue;
        }
        // 空。two-strike: 初回観測は候補に入れるだけで次サイクルに委ねる。
        if (confirmSet && !confirmSet.has(row.channel_id)) {
          confirmSet.add(row.channel_id);
          continue;
        }
        await deleteIfEmpty(vc, row); // 取得済みの row を渡して再SELECTを避ける
        confirmSet?.delete(row.channel_id);
      } catch (e) {
        console.error(`[VoiceRecruit] sweep error for ${row.channel_id}:`, e);
      }
    }
  }

  // 追跡対象から外れたIDを候補集合からも掃除（メモリリーク防止）。
  if (confirmSet) {
    const rowIds = new Set(rows.map((r) => r.channel_id));
    for (const id of confirmSet) if (!rowIds.has(id)) confirmSet.delete(id);
  }
}

/**
 * 一時VCの定期掃除を開始する。返り値を呼ぶと停止する。
 * 空（在室0）のVCを intervalMs ごとに削除する。
 *
 * 通常フロー（移動 or 入室→退出）は voiceStateUpdate で即削除されるため、これは
 * 「一度も誰も入らなかったVC」だけを拾う保険。頻度が高い必要はないので既定は60分。
 * 負荷は対象が進行中の募集分の数行のみ・在室判定はキャッシュ参照のため軽微。
 *
 * 起動直後の初回掃除も含めて全ての削除を two-strike（seenEmpty 共有）で保護する。
 * ゲートウェイ再接続やギルドキャッシュ充填の途中で在室VCが一瞬空に見えても、
 * 2サイクル連続で空を確認するまで削除しないため、在室ユーザーを誤って追い出さない。
 * 初回は initialDelayMs 待ってボイス状態キャッシュが揃ってから走る。
 */
export function startTempChannelSweeper(
  client: Client,
  intervalMs = 60 * 60 * 1000,
  initialDelayMs = 20 * 1000,
): () => void {
  // two-strike 判定用に「前サイクルで空だったVC」を保持する（起動時掃除とも共有）。
  const seenEmpty = new Set<string>();
  const run = () =>
    sweepTempChannels(client, seenEmpty).catch((e) =>
      console.error('[VoiceRecruit] periodic sweep error:', e),
    );
  // 起動直後の初回（キャッシュ充填待ち）。two-strike の1打目としてシードし、
  // 次サイクルでも空なら削除する。単発の即削除は行わない。
  const first = setTimeout(run, initialDelayMs);
  const timer = setInterval(run, intervalMs);
  // 定期掃除だけのためにプロセスを起こし続けない（Botはゲートウェイ接続で常時稼働）。
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
