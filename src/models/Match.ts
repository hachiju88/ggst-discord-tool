import { getDatabase } from '../database';
import { Match } from '../types';

export class MatchModel {
  // 対戦記録を作成
  static async create(
    userDiscordId: string,
    myCharacter: string | null,
    opponentCharacter: string,
    result: 'win' | 'loss',
    note?: string
  ): Promise<Match> {
    const db = getDatabase();

    const insertResult = await db.execute({
      sql: `
        INSERT INTO matches (user_discord_id, my_character, opponent_character, result, note)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [userDiscordId, myCharacter, opponentCharacter, result, note || null]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM matches WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as Match;
  }

  // ユーザーの全対戦記録を取得
  static async getByUser(
    userDiscordId: string,
    limit?: number,
    opponentCharacterFilter?: string,
    myCharacterFilter?: string
  ): Promise<Match[]> {
    const db = getDatabase();

    let query = 'SELECT * FROM matches WHERE user_discord_id = ?';
    const params: any[] = [userDiscordId];

    if (opponentCharacterFilter) {
      query += ' AND opponent_character = ?';
      params.push(opponentCharacterFilter);
    }

    if (myCharacterFilter) {
      query += ' AND my_character = ?';
      params.push(myCharacterFilter);
    }

    query += ' ORDER BY match_date DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const result = await db.execute({
      sql: query,
      args: params
    });

    return result.rows as unknown as Match[];
  }

  // 特定キャラとの対戦成績を取得
  static async getStats(
    userDiscordId: string,
    opponentCharacter?: string,
    myCharacter?: string
  ): Promise<{
    total: number;
    wins: number;
    losses: number;
  }> {
    const db = getDatabase();

    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
      FROM matches
      WHERE user_discord_id = ?
    `;
    const params: any[] = [userDiscordId];

    if (opponentCharacter) {
      query += ' AND opponent_character = ?';
      params.push(opponentCharacter);
    }

    if (myCharacter) {
      query += ' AND my_character = ?';
      params.push(myCharacter);
    }

    const result = await db.execute({
      sql: query,
      args: params
    });

    return result.rows[0] as unknown as {
      total: number;
      wins: number;
      losses: number;
    };
  }

  // キャラクター別の成績を取得
  static async getStatsByCharacter(userDiscordId: string): Promise<Array<{
    character: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  }>> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        SELECT
          opponent_character as character,
          COUNT(*) as total,
          SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM matches
        WHERE user_discord_id = ?
        GROUP BY opponent_character
        ORDER BY total DESC
      `,
      args: [userDiscordId]
    });

    const results = result.rows as unknown as Array<{
      character: string;
      total: number;
      wins: number;
      losses: number;
    }>;

    return results.map(r => ({
      ...r,
      winRate: r.total > 0 ? (r.wins / r.total) * 100 : 0
    }));
  }
}
