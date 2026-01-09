import { getDatabase } from '../database';
import { Match } from '../types';

export class MatchModel {
  // 対戦記録を作成
  static create(
    userDiscordId: string,
    opponentCharacter: string,
    result: 'win' | 'loss',
    note?: string
  ): Match {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO matches (user_discord_id, opponent_character, result, note)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(userDiscordId, opponentCharacter, result, note || null);

    return db.prepare('SELECT * FROM matches WHERE id = ?')
      .get(info.lastInsertRowid) as Match;
  }

  // ユーザーの全対戦記録を取得
  static getByUser(
    userDiscordId: string,
    limit?: number,
    characterFilter?: string
  ): Match[] {
    const db = getDatabase();

    let query = 'SELECT * FROM matches WHERE user_discord_id = ?';
    const params: any[] = [userDiscordId];

    if (characterFilter) {
      query += ' AND opponent_character = ?';
      params.push(characterFilter);
    }

    query += ' ORDER BY match_date DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return db.prepare(query).all(...params) as Match[];
  }

  // 特定キャラとの対戦成績を取得
  static getStats(userDiscordId: string, opponentCharacter?: string): {
    total: number;
    wins: number;
    losses: number;
  } {
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

    const result = db.prepare(query).get(...params) as {
      total: number;
      wins: number;
      losses: number;
    };

    return result;
  }

  // キャラクター別の成績を取得
  static getStatsByCharacter(userDiscordId: string): Array<{
    character: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  }> {
    const db = getDatabase();

    const results = db.prepare(`
      SELECT
        opponent_character as character,
        COUNT(*) as total,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
      FROM matches
      WHERE user_discord_id = ?
      GROUP BY opponent_character
      ORDER BY total DESC
    `).all(userDiscordId) as Array<{
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
