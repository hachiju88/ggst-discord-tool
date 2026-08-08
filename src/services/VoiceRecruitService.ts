import {
  Client,
  Guild,
  VoiceState,
  VoiceChannel,
  ChannelType,
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
  { value: 'プレマ', label: 'プレマ' },
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
  { value: 'regular', label: 'イツメン', description: '常連さん向け' },
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
}): Promise<void> {
  const db = getDatabase();
  await db.execute({
    sql: `
      INSERT OR REPLACE INTO temp_voice_channels
        (channel_id, guild_id, creator_id, announce_channel_id, announce_message_id, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    args: [
      params.channelId,
      params.guildId,
      params.creatorId,
      params.announceChannelId ?? null,
      params.announceMessageId ?? null,
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

async function getTempChannel(channelId: string): Promise<TempChannelRow | null> {
  const db = getDatabase();
  const res = await db.execute({
    sql: 'SELECT * FROM temp_voice_channels WHERE channel_id = ?',
    args: [channelId],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0] as any;
  return {
    channel_id: String(r.channel_id),
    guild_id: String(r.guild_id),
    creator_id: String(r.creator_id),
    announce_channel_id: r.announce_channel_id ? String(r.announce_channel_id) : null,
    announce_message_id: r.announce_message_id ? String(r.announce_message_id) : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
  };
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
  return res.rows.map((r: any) => ({
    channel_id: String(r.channel_id),
    guild_id: String(r.guild_id),
    creator_id: String(r.creator_id),
    announce_channel_id: r.announce_channel_id ? String(r.announce_channel_id) : null,
    announce_message_id: r.announce_message_id ? String(r.announce_message_id) : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
  }));
}

/** 1件の一時VCに対する即時掃除の結果（Discord上で原因を切り分けるための診断）。 */
export interface SweepDiagResult {
  channelId: string;
  name: string | null;
  ageMs: number | null; // 作成からの経過（created_at 不明なら null）
  memberCount: number | null; // Botが認識している在室人数（チャンネル消失なら null）
  outcome: 'deleted' | 'occupied' | 'gone' | 'delete_failed';
  detail?: string; // delete_failed の理由など
}

/**
 * 指定ギルドの追跡中一時VCを、猶予なし・two-strikeなしで即時に掃除し、
 * 各VCについて「なぜ消えた／消えなかったか」を返す診断用関数。
 * 管理者が Discord 上から手動実行して原因を切り分ける（サーバーログ不要）。
 */
export async function sweepGuildNow(guild: Guild): Promise<SweepDiagResult[]> {
  const rows = await getTempChannelsByGuild(guild.id);
  const now = Date.now();
  const results: SweepDiagResult[] = [];
  for (const row of rows) {
    const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await deleteTempChannelRow(row.channel_id);
      results.push({
        channelId: row.channel_id,
        name: channel?.name ?? null,
        ageMs: row.created_at ? now - parseCreatedAtMs(row.created_at) : null,
        memberCount: null,
        outcome: 'gone',
      });
      continue;
    }
    const vc = channel as VoiceChannel;
    const ageMs = row.created_at ? now - parseCreatedAtMs(row.created_at) : null;
    const memberCount = vc.members.size;
    if (memberCount > 0) {
      results.push({ channelId: vc.id, name: vc.name, ageMs, memberCount, outcome: 'occupied' });
      continue;
    }
    try {
      await vc.delete('簡単VC募集: 手動掃除（診断）');
      await deleteTempChannelRow(vc.id);
      results.push({ channelId: vc.id, name: vc.name, ageMs, memberCount, outcome: 'deleted' });
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 10003) {
        await deleteTempChannelRow(vc.id);
        results.push({ channelId: vc.id, name: vc.name, ageMs, memberCount, outcome: 'gone' });
      } else {
        results.push({
          channelId: vc.id,
          name: vc.name,
          ageMs,
          memberCount,
          outcome: 'delete_failed',
          detail: (e as { message?: string }).message ?? String(e),
        });
      }
    }
  }
  return results;
}

async function getAllTempChannels(): Promise<TempChannelRow[]> {
  const db = getDatabase();
  const res = await db.execute({ sql: 'SELECT * FROM temp_voice_channels' });
  return res.rows.map((r: any) => ({
    channel_id: String(r.channel_id),
    guild_id: String(r.guild_id),
    creator_id: String(r.creator_id),
    announce_channel_id: r.announce_channel_id ? String(r.announce_channel_id) : null,
    announce_message_id: r.announce_message_id ? String(r.announce_message_id) : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
  }));
}

/**
 * 一時VCが空になっていれば削除する。削除したら true。
 * 募集通知メッセージ側には手を加えない（終了時の編集は行わない）。
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

/**
 * VC作成直後に呼ぶ。一定時間後にまだ誰も入っていなければ削除する保険。
 * （募集主が結局VCに入らなかったケースの掃除）
 */
export function scheduleEmptyGuard(channel: VoiceChannel, delayMs = 3 * 60 * 1000): void {
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

// 空VCを削除するまでの猶予（作成直後で誰も入っていないVCを巻き込まないため）。
export const EMPTY_VC_GRACE_MS = 5 * 60 * 1000;

/**
 * 追跡中の一時VCを一括で掃除する。
 * - チャンネルが既に無い → 行だけ削除
 * - 空 かつ 作成から graceMs 以上経過 → チャンネルとともに削除
 *
 * graceMs は「作成直後でまだ誰も入っていないVC」を消さないための猶予。
 *
 * confirmSet を渡すと「2サイクル連続で空だった時だけ削除」する（two-strike）。
 * ゲートウェイ再接続直後などボイス状態キャッシュが未充填の瞬間は在室VCでも
 * members.size が 0 に見えることがあり、定期掃除がその瞬間に当たると在室VCを
 * 誤削除しうる。1回空を観測したら候補に入れるだけにし、次サイクルでも空なら削除
 * することで、一時的な空読みでの誤削除を防ぐ。起動時掃除（confirmSet未指定）は
 * 20秒待ってキャッシュ充填後に走るため即削除でよい。
 *
 * ※ 本来 voiceStateUpdate（退出時）で消えるが、募集主が自動移動できず
 * 　「一度も誰も入らなかったVC」は退出イベントが発生しないため消えない。
 * 　その取りこぼしと、再起動で scheduleEmptyGuard タイマーが失われるケースを
 * 　この掃除が救う。
 */
export async function sweepTempChannels(
  client: Client,
  graceMs = 0,
  confirmSet?: Set<string>,
): Promise<void> {
  let rows: TempChannelRow[];
  try {
    rows = await getAllTempChannels();
  } catch (e) {
    console.error('[VoiceRecruit] sweepTempChannels load error:', e);
    return;
  }

  const now = Date.now();
  // 同一ギルドに複数の一時VCがあっても guild fetch を1回で済ませるためにまとめる。
  const rowsByGuild = new Map<string, TempChannelRow[]>();
  for (const row of rows) {
    const list = rowsByGuild.get(row.guild_id);
    if (list) list.push(row);
    else rowsByGuild.set(row.guild_id, [row]);
  }

  for (const [guildId, guildRows] of rowsByGuild) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    for (const row of guildRows) {
      try {
        if (!guild) {
          await deleteTempChannelRow(row.channel_id);
          continue;
        }
        const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildVoice) {
          await deleteTempChannelRow(row.channel_id);
          continue;
        }
        const vc = channel as VoiceChannel;
        // 作成直後の猶予中、または在室中はスキップ（候補からも外す）。
        // ここでの在室判定は two-strike 集合の管理用。実削除の可否は
        // deleteIfEmpty 内の members.size チェックが最終的な拠り所（退出イベントや
        // 空ガード経由の呼び出しではそちらだけが働く）ので、両者は役割が異なる。
        if (
          (graceMs > 0 && now - parseCreatedAtMs(row.created_at) < graceMs) ||
          vc.members.size > 0
        ) {
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
 * 「空 かつ 作成から graceMs 以上経過」のVCを intervalMs ごとに削除する。
 *
 * これが本命の保険。退出イベント（voiceStateUpdate）は「一度も入られなかったVC」を
 * 拾えず、per-channel の scheduleEmptyGuard は再起動で失われるため、参加者0のまま
 * 残るVCはこの定期掃除でのみ確実に回収される。
 * 負荷は対象が進行中の募集分の数行のみ・在室判定はキャッシュ参照のため軽微。
 *
 * 起動直後の初回掃除も含めて全ての削除を two-strike（seenEmpty 共有）で保護する。
 * ゲートウェイ再接続やギルドキャッシュ充填の途中で在室VCが一瞬空に見えても、
 * 2サイクル連続で空を確認するまで削除しないため、在室ユーザーを誤って追い出さない。
 * 初回は initialDelayMs 待ってボイス状態キャッシュが揃ってから走る。
 */
export function startTempChannelSweeper(
  client: Client,
  intervalMs = 10 * 60 * 1000,
  graceMs = EMPTY_VC_GRACE_MS,
  initialDelayMs = 20 * 1000,
): () => void {
  // two-strike 判定用に「前サイクルで空だったVC」を保持する（起動時掃除とも共有）。
  const seenEmpty = new Set<string>();
  const run = () =>
    sweepTempChannels(client, graceMs, seenEmpty).catch((e) =>
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
