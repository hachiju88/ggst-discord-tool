import { getDatabase } from '../database';
import { PuddleFarmService } from './PuddleFarmService';

export type TrackedPlayer = {
  id: number;
  guild_id: string;
  puddle_player_id: number;
  display_name: string;
  char_short: string;
  char_long: string;
  added_by_discord_id: string;
  created_at: string;
};

export type RatingObservation = {
  puddle_player_id: number;
  char_short: string;
  observed_at: string;
  rating: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const RankTrackingService = {
  // ── tracked_players ──────────────────────────────────────────────────────

  async addTracking(
    guildId: string,
    puddlePlayerId: number,
    displayName: string,
    charShort: string,
    charLong: string,
    addedByDiscordId: string,
  ): Promise<'added' | 'duplicate'> {
    const db = getDatabase();
    try {
      await db.execute({
        sql: `INSERT INTO tracked_players (guild_id, puddle_player_id, display_name, char_short, char_long, added_by_discord_id)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [guildId, puddlePlayerId, displayName, charShort, charLong, addedByDiscordId],
      });
      return 'added';
    } catch (err: any) {
      if (err?.message?.includes('UNIQUE constraint')) return 'duplicate';
      throw err;
    }
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

  async getPostConfig(guildId: string): Promise<{ channel_id: string } | null> {
    const db = getDatabase();
    const result = await db.execute({
      sql: 'SELECT channel_id FROM rank_post_config WHERE guild_id = ?',
      args: [guildId],
    });
    return result.rows.length > 0 ? (result.rows[0] as unknown as { channel_id: string }) : null;
  },

  async getAllPostConfigs(): Promise<{ guild_id: string; channel_id: string }[]> {
    const db = getDatabase();
    const result = await db.execute({ sql: 'SELECT guild_id, channel_id FROM rank_post_config' });
    return result.rows as unknown as { guild_id: string; channel_id: string }[];
  },

  // ── rating_observations ───────────────────────────────────────────────────

  async storeObservations(
    puddlePlayerId: number,
    charShort: string,
    points: { timestamp: string; rating: number }[],
  ): Promise<void> {
    if (points.length === 0) return;
    const db = getDatabase();
    for (const p of points) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO rating_observations (puddle_player_id, char_short, observed_at, rating)
              VALUES (?, ?, ?, ?)`,
        args: [puddlePlayerId, charShort, p.timestamp, p.rating],
      });
    }
  },

  async getObservations(
    puddlePlayerId: number,
    charShort: string,
    windowDays: number,
  ): Promise<RatingObservation[]> {
    const db = getDatabase();
    const result = await db.execute({
      sql: `SELECT * FROM rating_observations
            WHERE puddle_player_id = ? AND char_short = ?
            ORDER BY observed_at ASC`,
      args: [puddlePlayerId, charShort],
    });
    const all = result.rows as unknown as RatingObservation[];
    const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
    return all.filter(o => new Date(o.observed_at).getTime() >= cutoff);
  },

  // ── Fetch and store all tracked players ───────────────────────────────────

  async fetchAndStoreAll(guildId?: string): Promise<void> {
    const db = getDatabase();
    const sql = guildId
      ? 'SELECT DISTINCT puddle_player_id, char_short FROM tracked_players WHERE guild_id = ?'
      : 'SELECT DISTINCT puddle_player_id, char_short FROM tracked_players';
    const args = guildId ? [guildId] : [];
    const result = await db.execute({ sql, args });
    const pairs = result.rows as unknown as { puddle_player_id: number; char_short: string }[];

    for (const { puddle_player_id, char_short } of pairs) {
      try {
        const points = await PuddleFarmService.getRatings(puddle_player_id, char_short, 1);
        await RankTrackingService.storeObservations(puddle_player_id, char_short, points);
      } catch (err) {
        console.error(`[RankTracking] Failed to fetch ${puddle_player_id}/${char_short}:`, err);
      }
      await sleep(1000);
    }
  },

  async backfillPlayer(puddlePlayerId: number, charShort: string): Promise<void> {
    try {
      const points = await PuddleFarmService.getRatings(puddlePlayerId, charShort, 90);
      await RankTrackingService.storeObservations(puddlePlayerId, charShort, points);
    } catch (err) {
      console.error(`[RankTracking] Backfill failed for ${puddlePlayerId}/${charShort}:`, err);
    }
  },
};
