import { getDatabase } from '../database';
import { PuddleFarmService } from './PuddleFarmService';

// puddle.farm の player ID は int64 で Number 上限を超えうるため、必ず string で扱う。
// DB にも TEXT として保存している。
export type TrackedPlayer = {
  id: number;
  guild_id: string;
  puddle_player_id: string;
  display_name: string;
  char_short: string;
  char_long: string;
  added_by_discord_id: string;
  created_at: string;
};

export type RatingObservation = {
  puddle_player_id: string;
  char_short: string;
  observed_at: string;
  rating: number;
};

// 正規化済み(ISO 8601 UTC)の行だけを対象にする条件。マイグレーションで変換できず
// 残った不正形式の行が文字列ソートで「最新」扱いされたり期間フィルタを素通りしないように。
const ISO_OBSERVED_AT = "observed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'";

const BACKFILL_GAME_LIMIT = 3000;
// GGST 1セット約3分、1時間最大約20試合 → バッファ込みで30
const HOURLY_GAME_LIMIT = 30;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const RankTrackingService = {
  // ── tracked_players ──────────────────────────────────────────────────────

  async addTracking(
    guildId: string,
    puddlePlayerId: string,
    displayName: string,
    charShort: string,
    charLong: string,
    addedByDiscordId: string,
  ): Promise<'added' | 'duplicate'> {
    const db = getDatabase();
    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO tracked_players (guild_id, puddle_player_id, display_name, char_short, char_long, added_by_discord_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [guildId, puddlePlayerId, displayName, charShort, charLong, addedByDiscordId],
    });
    return result.rowsAffected === 0 ? 'duplicate' : 'added';
  },

  async removeTracking(id: number): Promise<void> {
    const db = getDatabase();
    await db.execute({ sql: 'DELETE FROM tracked_players WHERE id = ?', args: [id] });
  },

  async getTracking(id: number): Promise<TrackedPlayer | null> {
    const db = getDatabase();
    const result = await db.execute({ sql: 'SELECT * FROM tracked_players WHERE id = ?', args: [id] });
    return result.rows.length > 0 ? (result.rows[0] as unknown as TrackedPlayer) : null;
  },

  async getGuildTracking(guildId: string): Promise<TrackedPlayer[]> {
    const db = getDatabase();
    const result = await db.execute({
      sql: 'SELECT * FROM tracked_players WHERE guild_id = ? ORDER BY created_at ASC',
      args: [guildId],
    });
    return result.rows as unknown as TrackedPlayer[];
  },

  async getGuildTrackingCount(guildId: string): Promise<number> {
    const db = getDatabase();
    const result = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM tracked_players WHERE guild_id = ?',
      args: [guildId],
    });
    return Number((result.rows[0] as any)?.cnt ?? 0);
  },

  // ── rank_post_config ───────────────────────────────────────────────────────

  async setPostConfig(guildId: string, channelId: string): Promise<void> {
    const db = getDatabase();
    await db.execute({
      sql: `INSERT INTO rank_post_config (guild_id, channel_id, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, updated_at = CURRENT_TIMESTAMP`,
      args: [guildId, channelId],
    });
  },

  async getPostConfig(guildId: string): Promise<{ channel_id: string; message_id: string | null } | null> {
    const db = getDatabase();
    const result = await db.execute({
      sql: 'SELECT channel_id, message_id FROM rank_post_config WHERE guild_id = ?',
      args: [guildId],
    });
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
    return { channel_id: String(row.channel_id), message_id: row.message_id ? String(row.message_id) : null };
  },

  // リンクパネルとして最後に投稿したメッセージを記録(投稿先チャンネルも同時に更新)
  async setPanelMessage(guildId: string, channelId: string, messageId: string): Promise<void> {
    const db = getDatabase();
    await db.execute({
      sql: `INSERT INTO rank_post_config (guild_id, channel_id, message_id, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id,
              message_id = excluded.message_id, updated_at = CURRENT_TIMESTAMP`,
      args: [guildId, channelId, messageId],
    });
  },

  async getAllPostConfigs(): Promise<{ guild_id: string; channel_id: string }[]> {
    const db = getDatabase();
    const result = await db.execute({ sql: 'SELECT guild_id, channel_id FROM rank_post_config' });
    return result.rows as unknown as { guild_id: string; channel_id: string }[];
  },

  // ── rating_observations ───────────────────────────────────────────────────

  async storeObservations(
    puddlePlayerId: string,
    charShort: string,
    points: { timestamp: string; rating: number }[],
  ): Promise<void> {
    if (points.length === 0) return;
    const db = getDatabase();
    const stmts = points.map(p => ({
      sql: `INSERT OR IGNORE INTO rating_observations (puddle_player_id, char_short, observed_at, rating)
            VALUES (?, ?, ?, ?)`,
      args: [puddlePlayerId, charShort, p.timestamp, p.rating],
    }));
    await db.batch(stmts, 'write');
  },

  async getObservations(
    puddlePlayerId: string,
    charShort: string,
    windowDays: number,
  ): Promise<RatingObservation[]> {
    const db = getDatabase();
    const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
    const result = await db.execute({
      sql: `SELECT * FROM rating_observations
            WHERE puddle_player_id = ? AND char_short = ?
              AND observed_at >= ? AND ${ISO_OBSERVED_AT}
            ORDER BY observed_at ASC`,
      args: [puddlePlayerId, charShort, cutoff],
    });
    return result.rows as unknown as RatingObservation[];
  },

  // ── Fetch and store all tracked players ───────────────────────────────────

  async fetchAndStoreAll(guildId?: string): Promise<void> {
    const db = getDatabase();
    const sql = guildId
      ? 'SELECT DISTINCT puddle_player_id, char_short FROM tracked_players WHERE guild_id = ?'
      : 'SELECT DISTINCT puddle_player_id, char_short FROM tracked_players';
    const args = guildId ? [guildId] : [];
    const result = await db.execute({ sql, args });
    const pairs = result.rows as unknown as { puddle_player_id: string; char_short: string }[];

    // 同一プレイヤーの /player 呼び出しを 1 回にまとめるためグループ化
    const byPlayer = new Map<string, string[]>();
    for (const { puddle_player_id, char_short } of pairs) {
      const id = String(puddle_player_id);
      const list = byPlayer.get(id) ?? [];
      list.push(char_short);
      byPlayer.set(id, list);
    }

    for (const [playerId, chars] of byPlayer) {
      // 1) 試合履歴ベースのレート(/ratings)。puddle.farm が取り込んだリプレイ分のみ。
      const recentByChar = new Map<string, number[]>();
      for (const charShort of chars) {
        try {
          const points = await PuddleFarmService.getRatings(playerId, charShort, HOURLY_GAME_LIMIT);
          if (points !== null) {
            await RankTrackingService.storeObservations(playerId, charShort, points);
            recentByChar.set(charShort, points.map(p => p.rating));
          } else console.warn(`[RankTracking] /ratings returned no data for ${playerId}/${charShort}`);
        } catch (err) {
          console.error(`[RankTracking] Failed to fetch ratings ${playerId}/${charShort}:`, err);
        }
      }

      // 2) 現在レート(/player)。/ratings はリプレイが取り込まれた試合しか含まず、
      //    最新値が遅れる/欠けることがあるため、puddle.farm 本家グラフと同様に
      //    現在値を「取得時刻」の観測として補完する(直近の保存値と異なる場合のみ)。
      try {
        const player = await PuddleFarmService.getPlayer(playerId);
        if (player) {
          for (const charShort of chars) {
            const r = player.ratings.find(x => x.char_short.toUpperCase() === charShort.toUpperCase());
            if (!r || !Number.isFinite(r.rating) || r.rating === 0) continue;
            await RankTrackingService.storeCurrentRating(
              playerId, charShort, r.rating, recentByChar.get(charShort) ?? [],
            );
          }
        }
      } catch (err) {
        console.error(`[RankTracking] Failed to fetch player ${playerId}:`, err);
      }
      await sleep(1000);
    }
  },

  async getLatestObservation(puddlePlayerId: string, charShort: string): Promise<RatingObservation | null> {
    const db = getDatabase();
    const result = await db.execute({
      sql: `SELECT * FROM rating_observations
            WHERE puddle_player_id = ? AND char_short = ? AND ${ISO_OBSERVED_AT}
            ORDER BY observed_at DESC LIMIT 1`,
      args: [puddlePlayerId, charShort],
    });
    return result.rows.length > 0 ? (result.rows[0] as unknown as RatingObservation) : null;
  },

  // /player の現在レートを「取得時刻」の観測として保存する。
  // puddle.farm の player_ratings はリプレイ取り込み時にタイムスタンプ比較なしで
  // 上書きされるため、古い試合の値が「現在値」として返ることがある。そこで
  // 直近に取得した /ratings の履歴に同じ値が含まれる場合は既に記録済み(または古い値)
  // とみなして保存しない。新しい試合後の値の取りこぼしより、誤った下降/上昇点を
  // 打つ方が有害なため保守的に判定する。
  async storeCurrentRating(
    puddlePlayerId: string,
    charShort: string,
    rating: number,
    recentRatings: number[] = [],
  ): Promise<boolean> {
    if (recentRatings.includes(rating)) return false;
    const latest = await RankTrackingService.getLatestObservation(puddlePlayerId, charShort);
    if (latest && Number(latest.rating) === rating) return false;
    await RankTrackingService.storeObservations(puddlePlayerId, charShort, [
      { timestamp: new Date().toISOString(), rating },
    ]);
    return true;
  },

  // currentRating: 呼び出し側で /player を取得済みならその値を渡す(重複リクエスト回避)。
  // undefined の場合はここで /player を取得する。
  async backfillPlayer(
    puddlePlayerId: string,
    charShort: string,
    currentRating?: number,
  ): Promise<{ count: number; error?: string }> {
    try {
      const points = await PuddleFarmService.getRatings(puddlePlayerId, charShort, BACKFILL_GAME_LIMIT);
      if (points === null) {
        return { count: 0, error: 'puddle.farm API からデータを取得できませんでした' };
      }
      await RankTrackingService.storeObservations(puddlePlayerId, charShort, points);
      // 履歴の最新値が現在レートとずれている場合に備えて現在値も補完
      try {
        let rating = currentRating;
        if (rating === undefined) {
          const player = await PuddleFarmService.getPlayer(puddlePlayerId);
          rating = player?.ratings.find(x => x.char_short.toUpperCase() === charShort.toUpperCase())?.rating;
        }
        if (rating !== undefined && Number.isFinite(rating) && rating !== 0) {
          await RankTrackingService.storeCurrentRating(
            puddlePlayerId, charShort, rating, points.map(p => p.rating),
          );
        }
      } catch (err) {
        console.warn(`[RankTracking] Current rating fetch failed for ${puddlePlayerId}/${charShort}:`, err);
      }
      return { count: points.length };
    } catch (err: any) {
      console.error(`[RankTracking] Backfill failed for ${puddlePlayerId}/${charShort}:`, err);
      return { count: 0, error: err?.message ?? String(err) };
    }
  },
};
